import { validId, httpsUrl, preflight, confirmation } from './policy.mjs';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const out = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
async function checked(query) {
  const { data, error } = await query;
  if (error) throw new Error('Unable to persist or read fulfillment state');
  return data;
}
export function createHandler({ createClient, env, fetch: send = globalThis.fetch }) {
  return async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'POST') return out({ error: 'POST required' }, 405);
    try {
      const url = env('SUPABASE_URL'), service = env('SUPABASE_SERVICE_ROLE_KEY'), anon = env('SUPABASE_ANON_KEY');
      if (!url || !service || !anon) return out({ error: 'Backend not configured' }, 503);
      const auth = req.headers.get('Authorization') || '', bearer = auth.replace(/^Bearer\s+/i, '');
      const db = createClient(url, service);
      let actor = 'internal';
      if (bearer !== service) {
        const uc = createClient(url, anon, { global: { headers: { Authorization: auth } } });
        const { data: { user }, error } = await uc.auth.getUser();
        if (error || !user?.email) return out({ error: 'Unauthorized' }, 401);
        const admin = await checked(db.from('admin_users').select('id').eq('email', user.email).eq('is_active', true).maybeSingle());
        if (!admin) return out({ error: 'Admin access required' }, 403);
        actor = user.email;
      }
      const body = await req.json();
      if (!validId(body.bookingId) || (body.componentIds !== undefined && (!Array.isArray(body.componentIds) || !body.componentIds.length || body.componentIds.some(x => !validId(x))))) return out({ error: 'Invalid booking or component IDs' }, 400);
      const bookingId = Number(body.bookingId), forceRetry = body.forceRetry === true, componentIds = body.componentIds?.map(Number) || [];
      const booking = await checked(db.from('bookings').select('id,status,payment_status,email,phone,total_price,amount_paid,cancellation_status,refund_status').eq('id', bookingId).maybeSingle());
      if (!booking) return out({ error: 'Booking not found' }, 404);
      if (booking.payment_status !== 'paid' || !Number.isFinite(Number(booking.total_price)) || Number(booking.total_price) <= 0 || !Number.isFinite(Number(booking.amount_paid)) || Number(booking.amount_paid) < Number(booking.total_price)) return out({ error: 'Full payment is required before supplier fulfillment' }, 409);
      if (booking.status === 'cancelled' || ![null, undefined, '', 'none', 'rejected'].includes(booking.cancellation_status) || ![null, undefined, '', 'none'].includes(booking.refund_status)) return out({ error: 'Cancellation or refund requires operations review' }, 409);
      const rows = await checked(db.from('booking_travelers').select('traveler_index,traveler_type,title,first_name,last_name,date_of_birth,gender,nationality,document_type,document_number,document_expiry,issuing_country').eq('booking_id', bookingId).order('traveler_index'));
      const travelers = rows.map(t => ({ travelerType: t.traveler_type, title: t.title, firstName: t.first_name, lastName: t.last_name, dateOfBirth: t.date_of_birth, gender: t.gender, nationality: t.nationality, documentType: t.document_type, documentNumber: t.document_number, documentExpiry: t.document_expiry, issuingCountry: t.issuing_country }));
      const components = await checked(db.from('booking_components').select('*').eq('booking_id', bookingId).order('id'));
      const results = [];
      for (const c of components) {
        const type = String(c.component_type || ''), attempts = Number(c.fulfillment_attempts || 0);
        const skip = reason => results.push({ id: c.id, type, status: c.status, skipped: true, reason });
        if (componentIds.length && !componentIds.includes(Number(c.id))) { skip('Not selected'); continue; }
        if (c.fulfillment_completed_at || ['confirmed', 'ticketed', 'cancelled'].includes(c.status)) { skip('Already finalized'); continue; }
        // A previous attempt may have booked successfully even if the response was lost.
        if (!['selected', 'pending', 'failed'].includes(c.status) || attempts > 0) { skip('Supplier reconciliation required before another attempt'); continue; }
        if (c.status === 'failed' && !forceRetry) { skip('Explicit retry required'); continue; }
        let reason = preflight(c, travelers, booking);
        const endpoint = httpsUrl(env(`SUPPLIER_BOOK_${type.toUpperCase()}_URL`)), apiKey = env(`SUPPLIER_BOOK_${type.toUpperCase()}_KEY`);
        if (!endpoint || !apiKey) reason ||= 'Supplier booking adapter not configured';
        if (reason) {
          await checked(db.from('booking_components').update({ fulfillment_last_error: reason, updated_at: new Date().toISOString() }).eq('id', c.id).eq('status', c.status).eq('fulfillment_attempts', attempts));
          results.push({ id: c.id, type, status: c.status, reason }); continue;
        }
        const key = c.fulfillment_key || `bk_${bookingId}_cp_${c.id}`;
        // Atomic compare-and-set: a concurrent worker cannot own the same external operation.
        const claim = await checked(db.from('booking_components').update({ status: 'booking', fulfillment_key: key, fulfillment_attempts: attempts + 1, fulfillment_started_at: new Date().toISOString(), fulfillment_last_error: null, updated_at: new Date().toISOString() }).eq('id', c.id).eq('status', c.status).eq('fulfillment_attempts', attempts).is('fulfillment_completed_at', null).select('id'));
        if (!claim.length) { skip('Another worker owns this component'); continue; }
        try {
          const r = await send(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'Idempotency-Key': key }, body: JSON.stringify({ bookingId, componentId: c.id, componentType: type, offerId: c.supplier_offer_id, offer: c.offer_json, idempotencyKey: key, travelers, contact: { email: booking.email, phone: booking.phone }, expectedPrice: Number(c.supplier_cost), currency: c.currency }) });
          if (!r.ok) throw new Error('Supplier request was not confirmed');
          const result = confirmation(await r.json(), type), next = type === 'flight' && result.ticketNumber ? 'ticketed' : 'confirmed';
          // Persist reconciliation evidence (including ticket number) before finalizing.
          await checked(db.from('booking_events').insert({ booking_id: bookingId, event_type: 'supplier_component_confirmed', payload: { componentId: c.id, ...result } }));
          const saved = await checked(db.from('booking_components').update({ status: next, supplier_booking_id: result.supplierBookingId, supplier_confirmation: result.confirmation, ticket_or_voucher_url: result.voucherUrl, fulfillment_completed_at: new Date().toISOString(), fulfillment_last_error: null, updated_at: new Date().toISOString() }).eq('id', c.id).eq('status', 'booking').eq('fulfillment_key', key).select('id'));
          if (!saved.length) throw new Error('Supplier result could not be persisted');
          results.push({ id: c.id, type, status: next, ...result });
        } catch {
          // Timeout, invalid response or save failure is ambiguous, never automatically retryable.
          const reason = 'Supplier outcome requires reconciliation; do not retry booking automatically';
          await checked(db.from('booking_components').update({ fulfillment_last_error: reason, updated_at: new Date().toISOString() }).eq('id', c.id).eq('status', 'booking').eq('fulfillment_key', key));
          results.push({ id: c.id, type, status: 'booking', manualAttention: true, reason });
        }
      }
      const latest = await checked(db.from('booking_components').select('status,component_type,supplier_confirmation,supplier_booking_id,fulfillment_last_error').eq('booking_id', bookingId));
      const active = latest.filter(c => c.status !== 'cancelled');
      const ready = !results.some(r => r.manualAttention) && active.length > 0 && active.every(c => c.component_type === 'flight' ? c.status === 'ticketed' && c.supplier_confirmation : ['confirmed', 'ticketed'].includes(c.status) && (c.supplier_confirmation || c.supplier_booking_id));
      const needsAttention = active.some(c => c.fulfillment_last_error || ['failed', 'booking'].includes(c.status));
      let transitioned = false;
      if (ready) {
        const changed = await checked(db.from('bookings').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', bookingId).eq('payment_status', 'paid').eq('status', 'paid').select('id'));
        transitioned = changed.length > 0;
      }
      await checked(db.from('booking_events').insert({ booking_id: bookingId, event_type: transitioned ? 'travel_ready' : needsAttention ? 'supplier_fulfillment_attention' : 'supplier_fulfillment_progress', payload: { results, by: actor, forceRetry, componentIds } }));
      let notification = null;
      if (transitioned) {
        try {
          const r = await send(`${url}/functions/v1/booking-notification`, { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${service}` }, body: JSON.stringify({ bookingId, event: 'travel_ready' }) });
          notification = { ok: r.ok, status: r.status };
        } catch { notification = { ok: false, error: 'Notification delivery requires review' }; }
      }
      return out({ bookingId, travelReady: ready, needsAttention, results, notification });
    } catch { return out({ error: 'Fulfillment could not complete; review persisted state before retrying' }, 500); }
  };
}
