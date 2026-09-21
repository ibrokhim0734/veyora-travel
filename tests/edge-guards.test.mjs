import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { webcrypto } from 'node:crypto';
import { notificationError, safeUrl } from '../supabase/functions/booking-notification/policy.mjs';

for (const event of ['confirmation','travel_ready','documents','payment']) {
  test(`notification ${event} requires supporting booking state`, () => {
    assert.ok(notificationError(event, { status:'new', payment_status:'unpaid', amount_paid:0 }, []));
  });
}
test('travel-ready email requires issued flight tickets', () => {
  assert.ok(notificationError('travel_ready',{payment_status:'paid'},[{component_type:'flight',status:'confirmed',supplier_confirmation:'PNR'}]));
  assert.equal(notificationError('travel_ready',{payment_status:'paid'},[{component_type:'flight',status:'ticketed',supplier_confirmation:'PNR'}]),null);
});
test('document URLs reject scripts, credentials and insecure schemes', () => {
  for (const url of ['javascript:alert(1)','data:text/html,hello','http://example.com','https://u:p@example.com']) assert.equal(safeUrl(url),'');
  assert.equal(safeUrl('https://example.com/voucher.pdf'),'https://example.com/voucher.pdf');
});
async function webhook(event,timestamp=String(Math.floor(Date.now()/1000))) {
  let handler, dbCalls=0, networkCalls=0;
  const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/stripe-webhook/index.ts',import.meta.url),'utf8').replace(/^import .*\n/,''));
  vm.runInNewContext(source,{ Deno:{env:{get:n=>n==='STRIPE_WEBHOOK_SECRET'?'test-signing-secret':'test-config'},serve:h=>handler=h},createClient:()=>({from(){dbCalls++;throw Error('Unexpected database write');}}),crypto:webcrypto,TextEncoder,Response,Date,console:{error(){}},fetch:()=>{networkCalls++;throw Error('Unexpected network');} });
  const raw=JSON.stringify(event),key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode('test-signing-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await webcrypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${raw}`));
  const signature=Buffer.from(bytes).toString('hex');
  const result=await handler(new Request('https://test.invalid',{method:'POST',headers:{'stripe-signature':`t=${timestamp},v1=${signature}`},body:raw}));
  return {status:result.status,body:await result.json(),dbCalls,networkCalls};
}
for(const payment_status of [undefined,'unpaid','no_payment_required']) {
  test(`signed webhook does not fulfill status ${payment_status}`,async()=>{
    const r=await webhook({type:'checkout.session.completed',data:{object:{payment_status,metadata:{booking_id:'1'},amount_total:10000}}});
    assert.equal(r.status,200);assert.equal(r.body.ignored,true);assert.equal(r.dbCalls,0);assert.equal(r.networkCalls,0);
  });
}
test('non-numeric signed timestamp rejected before database access',async()=>{
  const r=await webhook({type:'checkout.session.completed'},'NaN');assert.equal(r.status,400);assert.equal(r.dbCalls,0);
});
