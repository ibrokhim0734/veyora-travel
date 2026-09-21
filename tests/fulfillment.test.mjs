import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/supplier-orchestrator/handler.mjs';
import { confirmation, preflight } from '../supabase/functions/supplier-orchestrator/policy.mjs';

function fixture(type = 'hotel') {
  return { id: 10, booking_id: 1, component_type: type, status: 'pending', inventory_mode: 'live', supplier_offer_id: 'offer-1', supplier_cost: 80, sell_price: 100, currency: 'USD', offer_json: { mode: 'live', checkIn: '2099-01-01', checkOut: '2099-01-02', adults: 1, rooms: 1, pickup: 'Airport', dropoff: 'Hotel', dateTime: '2099-01-01T10:00:00Z', passengers: 1, date: '2099-01-01', travelers: 1 }, fulfillment_attempts: 0, fulfillment_completed_at: null };
}
function harness({ component = fixture(), booking = {}, response = { bookingId: 'order-1', confirmationCode: 'REF123' }, failClaim = false, failSave = false, timeout = false } = {}) {
  const tables = { bookings: [{ id: 1, status: 'paid', payment_status: 'paid', total_price: 100, amount_paid: 100, email: 'test@example.invalid', phone: '+998900000000', ...booking }], booking_components: [component], booking_travelers: [{ booking_id: 1, first_name: 'Test', last_name: 'Traveler' }], booking_events: [] };
  const calls = [];
  const db = { from(table) {
    let action = 'read', patch, single = false;
    const predicates = [];
    const q = {
      select() { return q; }, order() { return q; },
      eq(k, v) { predicates.push(row => row[k] === v); return q; },
      is(k, v) { predicates.push(row => (row[k] ?? null) === v); return q; },
      update(v) { action = 'update'; patch = v; return q; },
      insert(v) { action = 'insert'; patch = v; return q; },
      maybeSingle() { single = true; return q; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if ((failClaim && patch?.status === 'booking') || (failSave && patch?.status === 'confirmed')) return { data: null, error: { message: 'simulated database outage' } };
          const rows = tables[table].filter(row => predicates.every(p => p(row)));
          if (action === 'update') rows.forEach(row => Object.assign(row, patch));
          if (action === 'insert') tables[table].push(structuredClone(patch));
          return { data: structuredClone(single ? rows[0] ?? null : rows), error: null };
        }).then(resolve, reject);
      }
    };
    return q;
  }};
  const handler = createHandler({ createClient: () => db, env: name => ({ SUPABASE_URL: 'https://db.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-service', SUPABASE_ANON_KEY: 'test-anon' }[name] || (name.endsWith('_URL') ? 'https://supplier.example.invalid/book' : 'test-key')), fetch: async (url, options) => {
    calls.push({ url, options });
    await Promise.resolve();
    if (timeout) throw new Error('simulated timeout');
    return new Response(JSON.stringify(response), { status: 200 });
  }});
  const run = async (body = {}) => {
    const r = await handler(new Request('https://local.invalid', { method: 'POST', headers: { Authorization: 'Bearer test-service', 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: 1, ...body }) }));
    return { status: r.status, body: await r.json() };
  };
  return { tables, calls, run };
}

for (const type of ['hotel', 'transfer', 'experience']) {
  test(`${type}: confirmation persists and repeated invocation does not rebook or notify`, async () => {
    const h = harness({ component: fixture(type) });
    const a = await h.run(), b = await h.run();
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    assert.equal(h.tables.booking_components[0].supplier_booking_id, 'order-1');
    assert.equal(h.calls.filter(c => c.url.includes('supplier.')).length, 1);
    assert.equal(h.calls.filter(c => c.url.includes('booking-notification')).length, 1);
    const request = JSON.parse(h.calls[0].options.body);
    assert.equal(request.expectedPrice, 80); assert.equal(request.currency, 'USD');
  });
}
test('concurrent invocation claims a component once', async () => {
  const h = harness(); await Promise.all([h.run(), h.run()]);
  assert.equal(h.calls.filter(c => c.url.includes('supplier.')).length, 1);
  assert.equal(h.calls.filter(c => c.url.includes('booking-notification')).length, 1);
});
for (const response of [{}, { status: 'pending', bookingId: 'order' }, { bookingId: {} }, { bookingId: 'order', voucherUrl: 'javascript:alert(1)' }, { bookingId: 'order', success: false }]) {
  test(`ambiguous supplier response cannot confirm: ${JSON.stringify(response)}`, async () => {
    const h = harness({ response }); const result = await h.run();
    assert.equal(result.body.travelReady, false);
    assert.equal(h.tables.booking_components[0].status, 'booking');
    await h.run({ forceRetry: true }); assert.equal(h.calls.length, 1);
  });
}
test('timeout retains claim and blocks retries', async () => {
  const h = harness({ timeout: true }); await h.run(); await h.run({ forceRetry: true });
  assert.equal(h.calls.length, 1); assert.equal(h.tables.booking_components[0].status, 'booking');
});
test('failed claim makes no external request', async () => {
  const h = harness({ failClaim: true }); assert.equal((await h.run()).status, 500); assert.equal(h.calls.length, 0);
});
test('failed result save cannot notify and cannot rebook', async () => {
  const h = harness({ failSave: true }); await h.run(); await h.run({ forceRetry: true });
  assert.equal(h.calls.length, 1); assert.equal(h.tables.bookings[0].status, 'paid');
});
for (const booking of [{ payment_status: 'partially_paid' }, { amount_paid: 99 }, { status: 'cancelled' }, { cancellation_status: 'requested' }, { refund_status: 'pending' }]) {
  test(`ineligible booking does not call supplier: ${JSON.stringify(booking)}`, async () => {
    const h = harness({ booking }); assert.equal((await h.run()).status, 409); assert.equal(h.calls.length, 0);
  });
}
test('explicit demo offer cannot override live database flag', async () => {
  const component = fixture(); component.offer_json.mode = 'demo';
  const h = harness({ component }); await h.run(); assert.equal(h.calls.length, 0);
});
test('historically attempted failed component requires reconciliation', async () => {
  const h = harness({ component: { ...fixture(), status: 'failed', fulfillment_attempts: 1 } });
  await h.run({ forceRetry: true }); assert.equal(h.calls.length, 0);
});
test('PNR alone does not mean tickets are issued or trip is ready', async () => {
  const h = harness({ component: fixture('flight') });
  assert.equal((await h.run()).body.travelReady, false); assert.equal(h.calls.length, 1);
  assert.equal(h.tables.booking_components[0].status, 'confirmed');
});
test('flight response requires a PNR, not just an order ID', () => {
  assert.throws(() => confirmation({ bookingId: 'order' }, 'flight'));
});
test('invalid price and missing travelers are blocked before booking', () => {
  assert.match(preflight({ ...fixture(), supplier_cost: 0 }, [], {}), /prices/);
  assert.match(preflight(fixture(), [], { email: 'test@example.invalid' }), /travelers/);
});
test('invalid component selection cannot broaden into all components', async () => {
  const h = harness(); assert.equal((await h.run({ componentIds: ['oops'] })).status, 400); assert.equal(h.calls.length, 0);
});
