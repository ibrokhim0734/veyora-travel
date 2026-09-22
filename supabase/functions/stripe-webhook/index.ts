import { createClient } from 'npm:@supabase/supabase-js@2';
const json = (body:any,status=200) => new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json'}});
Deno.serve(async (req) => {
  if(req.method !== 'POST') return json({error:'POST required'},405);
  try {
    const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if(!secret) return json({error:'Stripe webhook secret not configured'},503);
    const raw = await req.text(), values:Record<string,string[]> = {};
    for(const part of (req.headers.get('stripe-signature') || '').split(',')) {
      const index=part.indexOf('=');
      if(index>0) (values[part.slice(0,index)] ??= []).push(part.slice(index+1));
    }
    const timestamp=values.t?.[0];
    if(!timestamp || !/^\d+$/.test(timestamp) || !Number.isFinite(Number(timestamp)) || Math.abs(Date.now()/1000-Number(timestamp))>300)
      return json({error:'Expired or missing Stripe signature'},400);
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${raw}`));
    const mac=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(!values.v1?.some(value=>value.length===mac.length && [...value].reduce((diff,c,i)=>diff | (c.charCodeAt(0)^mac.charCodeAt(i)),0)===0))
      return json({error:'Invalid Stripe signature'},400);
    const event=JSON.parse(raw), session=event.data?.object || {};
    const success=['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type);
    if(!success && event.type!=='checkout.session.expired') return json({received:true,ignored:true});
    if(success && session.payment_status!=='paid') return json({received:true,ignored:true,reason:'Checkout session is not paid'});
    const bookingId=Number(session.metadata?.booking_id);
    if(!Number.isSafeInteger(bookingId) || bookingId<=0 || typeof event.id!=='string' || !event.id || typeof session.id!=='string' || !session.id)
      return json({error:'Invalid booking payment identity'},400);
    const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
    const db=createClient(url,service);
    if(!success) {
      const {error}=await db.from('payment_events').insert({booking_id:bookingId,event_type:'checkout_session_expired',provider:'stripe',reference:session.id,provider_event_id:event.id,payload:{}});
      if(error && error.code!=='23505') throw error;
      return json({received:true});
    }
    if(!Number.isSafeInteger(session.amount_total) || session.amount_total<=0 || typeof session.payment_intent!=='string' || !session.payment_intent)
      return json({error:'Invalid paid amount or payment intent'},400);
    const {data:payment,error}=await db.rpc('record_stripe_payment',{
      p_booking_id:bookingId,p_event_id:event.id,p_reference:session.payment_intent,p_session_id:session.id,
      p_amount:session.amount_total/100,p_currency:String(session.currency || '').toUpperCase(),p_payment_type:session.metadata?.payment_type || 'full'
    });
    if(error) throw error;
    if(!payment || payment.blocked) return json({received:true,reviewRequired:true});
    // Retry delivery after an interrupted webhook too. Both receivers own their deduplication.
    async function dispatch(name:string,body:any) {
      const response=await fetch(`${url}/functions/v1/${name}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),
        headers:{'Content-Type':'application/json',apikey:anon,Authorization:`Bearer ${service}`},body:JSON.stringify(body)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw Error(`${name} delivery failed (${response.status})`);
      return result;
    }
    // Start fulfillment before email so a notification outage cannot prevent supplier dispatch.
    let fulfillment=null;
    if(payment.payment_status==='paid') fulfillment=await dispatch('supplier-orchestrator',{bookingId});
    let notification;
    try { notification=await dispatch('booking-notification',{bookingId,event:'payment'}); }
    catch { notification={ok:false,reviewRequired:true}; }
    return json({received:true,duplicate:payment.duplicate,fulfillment,notification});
  } catch(error) {
    console.error('Stripe webhook processing failed',error);
    return json({error:'Payment processing requires retry or operations review'},500);
  }
});

