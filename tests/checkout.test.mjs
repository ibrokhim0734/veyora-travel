import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/create-payment-session/index.ts',import.meta.url),'utf8').replace(/^import .*\n/,''));
async function run({booking={},component={},missingAdapter=false,pricingError=false,pct=30}={}) {
  let handler,calls=0,sent;
  const reads=[];
  const db={from(table){reads.push(table);let single=false,write=false;const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},maybeSingle(){single=true;return q;},insert(){write=true;return q;},then(resolve){
    const data=table==='bookings'?{id:1,public_reference:'TEST',status:'new',total_price:100,amount_paid:0,payment_status:'unpaid',currency:'USD',...booking}:table==='booking_components'?[{component_type:'hotel',inventory_mode:'live',offer_json:{mode:'live'},supplier_offer_id:'offer-1',sell_price:100,currency:'USD',status:'pending',...component}]:table==='pricing_config'?{deposit_percent:pct}:null;
    return Promise.resolve({data,error:table==='pricing_config'&&pricingError?{message:'Read failed'}:null}).then(resolve);
  }};return q;}};
  vm.runInNewContext(source,{createClient:()=>db,Deno:{serve:h=>handler=h,env:{get:n=>n==='SITE_URL'?'https://veyora.example.invalid':missingAdapter&&n.startsWith('SUPPLIER_BOOK_')?undefined:'test-config'}},Response,URL,URLSearchParams,AbortSignal,console:{error(){}},fetch:async(u,o)=>{calls++;sent=new URLSearchParams(o.body);return {ok:true,json:async()=>({id:'cs_test_mock',url:'https://checkout.stripe.com/test'})};}});
  const r=await handler(new Request('https://test.invalid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reference:'TEST',token:'test-token',paymentType:'deposit',siteUrl:'https://attacker.invalid'})}));
  return {status:r.status,body:await r.json(),reads,calls,sent};
}
test('checkout uses real pricing table and configured deposit percentage',async()=>{const r=await run();assert.equal(r.status,200);assert.equal(r.body.amount,30);assert.equal(r.sent.get('line_items[0][price_data][unit_amount]'),'3000');assert.ok(r.reads.includes('pricing_config'));assert.ok(!r.reads.includes('pricing_settings'));});
test('checkout ignores caller-controlled redirect origin',async()=>{const r=await run();assert.ok(r.sent.get('success_url').startsWith('https://veyora.example.invalid/'));});
for(const options of [{booking:{status:'cancelled'}},{booking:{total_price:'NaN'}},{booking:{currency:'JPY'}},{component:{offer_json:{mode:'demo'}}},{missingAdapter:true},{pricingError:true},{pct:0}]) {
  test(`checkout blocks unsafe input before Stripe ${JSON.stringify(options)}`,async()=>{const r=await run(options);assert.ok(r.status>=400);assert.equal(r.calls,0);});
}
