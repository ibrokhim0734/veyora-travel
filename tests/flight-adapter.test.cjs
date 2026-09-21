const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(require.resolve('../server/routes/supplier-amadeus-flight.js'), 'utf8');
function payload() {
  return { idempotencyKey: 'test-op', expectedPrice: 100, currency: 'USD', offer: { mode: 'live', offer: { price: { total: '100', currency: 'USD' } } }, contact: { email: 'test@example.invalid' }, travelers: [{ firstName: 'Test', lastName: 'Traveler', dateOfBirth: '1990-01-01', gender: 'MALE', documentNumber: 'TEST123', documentExpiry: '2035-01-01', nationality: 'UZ', issuingCountry: 'UZ' }] };
}
async function run({ body = payload(), host = 'https://api.amadeus.com', after = 100, currency = 'USD', order = { id: 'order', associatedRecords: [{ reference: 'PNR123' }] } } = {}) {
  const calls = [], context = { module: { exports: {} }, process: { env: { AMADEUS_HOST: host, AMADEUS_CLIENT_ID: 'test', AMADEUS_CLIENT_SECRET: 'test', SUPPLIER_ADAPTER_SHARED_SECRET: 'test' } }, URLSearchParams, AbortSignal, fetch: async (url, options) => {
    calls.push(url);
    const data = url.includes('oauth2') ? { access_token: 'test', expires_in: 1000 } : url.includes('/pricing') ? { data: { flightOffers: [{ price: { total: String(after), currency } }] } } : { data: order };
    return { ok: true, json: async () => data };
  }};
  vm.runInNewContext(code, context);
  const res = { status(s) { this.code = s; return this; }, json(d) { this.body = d; return this; } };
  await context.module.exports({ method: 'POST', headers: { authorization: 'Bearer test', 'idempotency-key': 'test-op' }, body }, res);
  return { ...res, calls };
}
test('valid mocked production response returns an actual PNR', async () => { const r = await run(); assert.equal(r.code, 200); assert.equal(r.body.pnr, 'PNR123'); });
test('provider order ID is not an airline PNR', async () => { const r = await run({ order: { id: 'order-only' } }); assert.equal(r.code, 502); });
for (const options of [{ after: 101 }, { after: 0 }, { currency: 'EUR' }]) {
  test(`reprice guard prevents order call ${JSON.stringify(options)}`, async () => { const r = await run(options); assert.equal(r.code, 409); assert.ok(r.calls.every(u => !u.includes('/booking/'))); });
}
test('test host cannot produce a production booking', async () => { const r = await run({ host: 'https://test.api.amadeus.com' }); assert.equal(r.code, 503); assert.equal(r.calls.length, 0); });
for (const date of ['2000-02-31', '2100-01-01']) {
  test(`reject invalid birth date ${date} before network`, async () => { const body = payload(); body.travelers[0].dateOfBirth = date; const r = await run({ body }); assert.equal(r.code, 422); assert.equal(r.calls.length, 0); });
}
test('reject missing explicit live mode', async () => { const body = payload(); delete body.offer.mode; const r = await run({ body }); assert.equal(r.code, 409); assert.equal(r.calls.length, 0); });
test('reject missing price authorization', async () => { const body = payload(); delete body.expectedPrice; const r = await run({ body }); assert.equal(r.code, 409); assert.equal(r.calls.length, 0); });
test('reject mismatched idempotency key', async () => { const body = payload(); body.idempotencyKey = 'different'; const r = await run({ body }); assert.equal(r.code, 422); assert.equal(r.calls.length, 0); });
