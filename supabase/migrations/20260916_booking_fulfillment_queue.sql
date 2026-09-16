-- VEYORA fulfillment queue groundwork.
-- Payment webhooks already emit supplier_fulfillment_ready after full payment.
-- This view gives operations a deterministic, idempotent queue of bookings
-- that are paid and waiting for supplier fulfillment.

create or replace view public.veyora_fulfillment_queue
with (security_invoker = true)
as
select
  b.id as booking_id,
  b.public_reference,
  b.status as booking_status,
  b.payment_status,
  max(e.created_at) filter (where e.event_type = 'supplier_fulfillment_ready') as ready_at,
  count(c.id) filter (where c.status in ('pending','selected','booking','failed')) as open_components,
  count(c.id) filter (where c.status = 'failed') as failed_components
from public.bookings b
join public.booking_events e on e.booking_id = b.id
left join public.booking_components c on c.booking_id = b.id and c.status <> 'cancelled'
where b.payment_status = 'paid'
  and e.event_type = 'supplier_fulfillment_ready'
group by b.id, b.public_reference, b.status, b.payment_status
having count(c.id) filter (where c.status in ('pending','selected','booking','failed')) > 0;

comment on view public.veyora_fulfillment_queue is
'Paid VEYORA bookings that have emitted supplier_fulfillment_ready and still need supplier processing.';
