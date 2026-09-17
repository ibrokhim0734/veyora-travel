-- VEYORA supplier fulfillment retry visibility.
-- Failed components remain explicit; after 3 attempts operations should review manually.

create or replace view public.veyora_fulfillment_retry_queue
with (security_invoker = true)
as
select
  c.booking_id,
  b.public_reference,
  c.id as component_id,
  c.component_type,
  c.status,
  coalesce(c.fulfillment_attempts, 0) as fulfillment_attempts,
  c.fulfillment_last_error,
  c.updated_at,
  case
    when coalesce(c.fulfillment_attempts, 0) >= 3 then 'manual_attention'
    else 'retry_eligible'
  end as retry_state
from public.booking_components c
join public.bookings b on b.id = c.booking_id
where b.payment_status = 'paid'
  and c.status = 'failed';

comment on view public.veyora_fulfillment_retry_queue is
'Failed paid-booking components awaiting retry or manual attention; 3+ attempts are flagged for manual attention.';
