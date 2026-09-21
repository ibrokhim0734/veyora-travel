export function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function notificationError(event, booking, components) {
  if (!['confirmation', 'travel_ready', 'documents', 'payment'].includes(event)) return 'Invalid notification event';
  if (booking.status === 'cancelled') return 'Cancelled booking cannot receive this notification';
  if (event === 'payment' && !(Number(booking.amount_paid) > 0 && ['paid', 'partially_paid'].includes(booking.payment_status))) return 'No recorded payment';
  if (event === 'confirmation' && booking.status !== 'confirmed') return 'Booking is not confirmed';
  if (event === 'travel_ready') {
    const active = components.filter(c => c.status !== 'cancelled');
    if (booking.payment_status !== 'paid' || !active.length || !active.every(c => c.component_type === 'flight' ? c.status === 'ticketed' && c.supplier_confirmation : ['confirmed', 'ticketed'].includes(c.status) && (c.supplier_confirmation || c.supplier_booking_id))) return 'Trip services are not ready';
  }
  if (event === 'documents' && !safeUrl(booking.voucher_url) && !safeUrl(booking.invoice_url) && !components.some(c => safeUrl(c.ticket_or_voucher_url))) return 'No travel documents are available';
  return null;
}
