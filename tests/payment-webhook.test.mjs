import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
async function invoke(payment, rpcError=null, dispatchFails=false) {
 let handler;const calls=[];
 const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/stripe-webhook/index.ts','utf8').replace(/^import .*\n/,''));
 vm.runInNewContext(source,{Deno:{env:{get:()=> 'test'},serve:h=>handler=h},crypto:webcrypto,TextEncoder,Response,AbortSignal,Date,console:{error(){}},createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:payment,error:rpcError};},from(){throw Error('Nonatomic payment write');}}),fetch:async(url)=>{calls.push({url});return new Response('{}',{status:dispatchFails?503:200});}});
 const raw=JSON.stringify({id:'evt_test',type:'checkout.session.completed',data:{object:{id:'cs_test',payment_intent:'pi_test',payment_status:'paid',amount_total:3000,currency:'usd',metadata:{booking_id:'1',payment_type:'deposit'}}}}),t=String(Math.floor(Date.now()/1000));
 const key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode('test'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=Buffer.from(await webcrypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${t}.${raw}`))).toString('hex');
 const response=await handler(new Request('https://test.invalid',{method:'POST',headers:{'stripe-signature':`t=${t},v1=${sig}`},body:raw}));
 return {status:response.status,calls,body:await response.json()};
}
test('paid webhook records through atomic RPC and dispatches fulfillment first',async()=>{const r=await invoke({payment_status:'paid'});assert.equal(r.status,200);assert.equal(r.calls[0].name,'record_stripe_payment');assert.equal(r.calls[0].args.p_reference,'pi_test');assert.equal(r.calls[0].args.p_amount,30);assert.match(r.calls[1].url,/supplier-orchestrator$/);});
test('duplicate paid event retries interrupted delivery',async()=>{const r=await invoke({payment_status:'paid',duplicate:true});assert.equal(r.status,200);assert.match(r.calls[1].url,/supplier-orchestrator$/);});
test('atomic ledger error causes retry without external delivery',async()=>{const r=await invoke(null,{message:'database unavailable'});assert.equal(r.status,500);assert.equal(r.calls.length,1);});
test('cancelled payment is recorded but does not fulfill or notify',async()=>{const r=await invoke({payment_status:'paid',blocked:true});assert.equal(r.status,200);assert.equal(r.calls.length,1);});
test('supplier dispatch failure is not acknowledged as delivered',async()=>{const r=await invoke({payment_status:'paid'},null,true);assert.equal(r.status,500);});
test('deposit cannot start fulfillment',async()=>{const r=await invoke({payment_status:'partially_paid'});assert.equal(r.status,200);assert.match(r.calls[1].url,/booking-notification$/);assert.equal(r.calls.length,2);});

