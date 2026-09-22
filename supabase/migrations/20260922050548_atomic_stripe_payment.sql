-- One transaction owns both the payment ledger and booking balance.
CREATE UNIQUE INDEX IF NOT EXISTS stripe_success_reference_unique
ON public.payment_events(reference)
WHERE provider = 'stripe' AND event_type = 'payment_succeeded';

CREATE OR REPLACE FUNCTION public.record_stripe_payment(
  p_booking_id bigint, p_event_id text, p_reference text,
  p_session_id text, p_amount numeric, p_currency text, p_payment_type text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  b public.bookings%ROWTYPE;
  existing public.payment_events%ROWTYPE;
  next_paid numeric;
  next_status text;
  blocked boolean;
BEGIN
  IF p_event_id IS NULL OR p_event_id = '' OR p_reference IS NULL OR p_reference = ''
    OR p_session_id IS NULL OR p_session_id = '' OR p_amount IS NULL
    OR p_amount <= 0 OR p_amount::text IN ('NaN','Infinity','-Infinity')
    OR p_amount <> round(p_amount,2)
    OR p_currency IS NULL OR p_currency NOT IN ('USD','EUR','GBP','AED','SAR','UZS','TRY','CNY','AUD','CAD','CHF','SGD')
    OR p_payment_type IS NULL OR p_payment_type NOT IN ('deposit','full') THEN
    RAISE EXCEPTION 'Invalid payment payload';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  blocked := b.status = 'cancelled'
    OR coalesce(b.cancellation_status,'none') NOT IN ('','none','rejected')
    OR coalesce(b.refund_status,'none') NOT IN ('','none');
  SELECT * INTO existing FROM public.payment_events
    WHERE provider_event_id = p_event_id
      OR (provider = 'stripe' AND event_type = 'payment_succeeded' AND reference = p_reference)
    LIMIT 1;
  IF FOUND THEN
    IF existing.booking_id <> p_booking_id OR existing.amount <> p_amount
      OR existing.currency <> p_currency OR existing.reference <> p_reference THEN
      RAISE EXCEPTION 'Payment identity conflict';
    END IF;
    RETURN jsonb_build_object('duplicate',true,'payment_status',b.payment_status,'blocked',blocked);
  END IF;
  IF b.currency <> p_currency OR b.total_price IS NULL OR b.total_price <= 0
    OR b.amount_paid IS NULL OR b.amount_paid < 0
    OR p_amount > b.total_price - b.amount_paid THEN
    RAISE EXCEPTION 'Payment requires balance or currency review';
  END IF;
  next_paid := b.amount_paid + p_amount;
  next_status := CASE WHEN next_paid = b.total_price THEN 'paid' ELSE 'partially_paid' END;
  INSERT INTO public.payment_events(booking_id,event_type,provider,amount,currency,reference,provider_event_id,payload)
    VALUES(p_booking_id,'payment_succeeded','stripe',p_amount,p_currency,p_reference,p_event_id,
      jsonb_build_object('checkoutSessionId',p_session_id,'paymentType',p_payment_type));
  UPDATE public.bookings SET amount_paid=next_paid,payment_status=next_status,
    payment_type=p_payment_type,payment_provider='stripe',payment_reference=p_reference,
    payment_updated_at=now(),updated_at=now(),
    status=CASE WHEN blocked OR b.status='confirmed' THEN b.status
      WHEN next_status='paid' THEN 'paid'
      WHEN b.status IN ('new','contacted','quoted') THEN 'awaiting_payment' ELSE b.status END
    WHERE id=p_booking_id;
  INSERT INTO public.booking_events(booking_id,event_type,payload)
    VALUES(p_booking_id,'payment_'||next_status,jsonb_build_object('amount',p_amount,'currency',p_currency,'provider','stripe','paymentType',p_payment_type));
  IF blocked THEN
    INSERT INTO public.booking_events(booking_id,event_type,payload)
      VALUES(p_booking_id,'payment_requires_review',jsonb_build_object('stripeEventId',p_event_id));
  ELSIF next_status='paid' THEN
    UPDATE public.booking_components SET status='pending',updated_at=now()
      WHERE booking_id=p_booking_id AND status='selected';
    INSERT INTO public.booking_events(booking_id,event_type,payload)
      VALUES(p_booking_id,'supplier_fulfillment_ready',jsonb_build_object('reason','full_payment_received','stripeEventId',p_event_id));
  END IF;
  RETURN jsonb_build_object('duplicate',false,'payment_status',next_status,'blocked',blocked);
END;
$$;
REVOKE ALL ON FUNCTION public.record_stripe_payment(bigint,text,text,text,numeric,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stripe_payment(bigint,text,text,text,numeric,text,text) TO service_role;

