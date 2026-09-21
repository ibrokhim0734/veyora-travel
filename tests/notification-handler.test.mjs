import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { notificationError, safeUrl } from '../supabase/functions/booking-notification/policy.mjs';
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/booking-notification/index.ts',import.meta.url),'utf8').replace(/^import .*\n/gm,''));
function setup({ timeout=false, persistFailure=false }={}) {
  let handler,calls=0;
  const events=[],booking={id:1,email:'test@example.invalid',customer_name:'Test',status:'confirmed',payment_status:'paid',amount_paid:100,public_reference:'TEST',public_token:'test-token'};
  const db={from(table){let action='read',value,single=false;const filters=[];const q={
    select(){return q;},order(){return q;},limit(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},
    contains(k,v){filters.push(r=>Object.entries(v).every(([a,b])=>r[k]?.[a]===b));return q;},single(){single=true;return q;},
    insert(v){action='insert';value=v;return q;},
    then(resolve,reject){return Promise.resolve().then(()=>{
      if(action==='insert'){if(persistFailure)return {error:{message:'Database unavailable'}};events.push(structuredClone(value));return {data:null,error:null};}
      const rows=table==='bookings'?[booking]:table==='booking_components'?[{id:10,booking_id:1,component_type:'hotel',status:'confirmed',supplier_confirmation:'REF'}]:events;
      const result=rows.filter(r=>filters.every(f=>f(r)));return {data:single?result[0]:result,error:null};
    }).then(resolve,reject);}
  };return q;}};
  vm.runInNewContext(source,{notificationError,safeUrl,createClient:()=>db,Deno:{serve:h=>handler=h,env:{get:n=>({SUPABASE_SERVICE_ROLE_KEY:'test-service',RESEND_API_KEY:'test-key',VEYORA_FROM_EMAIL:'test@example.invalid'}[n]||'https://example.invalid')}},Response,URL,AbortSignal,console:{error(){}},fetch:async(url,options)=>{
    calls++;assert.equal(events[0].event_type,'customer_notification_attempt');assert.ok(options.headers['Idempotency-Key']);
    if(timeout)throw Error('Timed out');return {ok:true,json:async()=>({id:'test-message'})};
  }});
  return {events,get calls(){return calls;},async run(event='travel_ready'){
    const r=await handler(new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer test-service','Content-Type':'application/json'},body:JSON.stringify({bookingId:1,event})}));return {status:r.status,body:await r.json()};
  }};
}
test('notification writes attempt before mocked send, then blocks duplicate send',async()=>{
  const h=setup();assert.equal((await h.run()).body.delivery,'sent');assert.equal((await h.run()).status,409);assert.equal(h.calls,1);
});
test('notification timeout is not blindly retried',async()=>{
  const h=setup({timeout:true});assert.equal((await h.run()).body.delivery,'failed');assert.equal((await h.run()).status,409);assert.equal(h.calls,1);
});
test('notification ledger failure prevents provider call',async()=>{
  const h=setup({persistFailure:true});assert.equal((await h.run()).status,500);assert.equal(h.calls,0);
});
test('invalid notification event never calls email provider',async()=>{
  const h=setup();assert.equal((await h.run('invented')).status,409);assert.equal(h.calls,0);
});
