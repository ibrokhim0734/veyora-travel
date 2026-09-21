const TYPES = new Set(['flight', 'hotel', 'transfer', 'experience']);
export const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
export function httpsUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function preflight(c, travelers, contact) {
  if (!TYPES.has(c.component_type)) return 'Unsupported supplier component type';
  const o = c.offer_json;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return 'Supplier offer is missing';
  const modes = [c.inventory_mode, o.mode, o.inventory_mode, o.raw?.mode].filter(v => v != null);
  if (!modes.length || modes.some(v => v !== 'live') || o.bookable === false || o.raw?.bookable === false) return 'Component is not bookable LIVE inventory';
  if (!text(c.supplier_offer_id)) return 'Stable supplier offer ID is required';
  if (![c.supplier_cost, c.sell_price].every(v => Number.isFinite(Number(v)) && Number(v) > 0)) return 'Valid supplier and selling prices are required';
  if (!/^[A-Z]{3}$/.test(c.currency || '')) return 'Valid component currency is required';
  if (!/^\S+@\S+\.\S+$/.test(contact.email || '')) return 'Valid contact email is required';
  if (!travelers.length || travelers.some(t => !text(t.firstName) || !text(t.lastName))) return 'Named travelers are required';
  const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
  const positiveInteger = v => Number.isSafeInteger(Number(v)) && Number(v) > 0;
  if (c.component_type === 'hotel' && (!date(o.checkIn) || !date(o.checkOut) || o.checkIn < new Date().toISOString().slice(0,10) || o.checkOut <= o.checkIn || !positiveInteger(o.adults) || !positiveInteger(o.rooms))) return 'Valid hotel dates, guests and rooms are required';
  if (c.component_type === 'transfer' && (!text(o.pickup) || !text(o.dropoff) || !Number.isFinite(Date.parse(o.dateTime)) || Date.parse(o.dateTime) <= Date.now() || !positiveInteger(o.passengers) || !/^\+[1-9]\d{6,14}$/.test(contact.phone || ''))) return 'Valid transfer route, time, passengers and international phone are required';
  if (c.component_type === 'experience' && (!date(o.date) || o.date < new Date().toISOString().slice(0,10) || !positiveInteger(o.travelers))) return 'Valid experience date and traveler count are required';
  if (c.start_at && (!Number.isFinite(Date.parse(c.start_at)) || Date.parse(c.start_at) <= Date.now())) return 'Service start must be in the future';
  if (c.end_at && c.start_at && Date.parse(c.end_at) <= Date.parse(c.start_at)) return 'Service end must follow start';
  return null;
}
export function confirmation(d, type) {
  if (!d || typeof d !== 'object' || Array.isArray(d) || d.error || d.ok === false || d.success === false) throw new Error('Supplier did not confirm booking');
  if (d.status && !['confirmed', 'ticketed', 'CONFIRMED', 'TICKETED'].includes(d.status)) throw new Error('Supplier booking is not confirmed');
  const code = text(d.confirmationCode) || text(d.pnr) || text(d.bookingReference) || text(d.supplierConfirmation);
  const bookingId = text(d.bookingId) || text(d.supplierBookingId) || code;
  if (!bookingId || (type === 'flight' && !code)) throw new Error('Supplier returned no stable confirmation');
  const v = d.voucherUrl || d.ticketOrVoucherUrl, voucher = v ? httpsUrl(v) : null;
  if (v && !voucher) throw new Error('Supplier document URL is invalid');
  return { supplierBookingId: bookingId, confirmation: code, ticketNumber: text(d.ticketNumber), voucherUrl: voucher };
}
