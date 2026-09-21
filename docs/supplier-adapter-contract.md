# VEYORA Supplier Booking Adapter Contract

VEYORA supplier fulfillment calls one booking adapter per component type. The orchestrator sends the same normalized payload to every adapter so providers can be swapped without changing checkout or booking logic.

## Environment variables

For each supported component type configure:

- `SUPPLIER_BOOK_FLIGHT_URL`
- `SUPPLIER_BOOK_FLIGHT_KEY`
- `SUPPLIER_BOOK_HOTEL_URL`
- `SUPPLIER_BOOK_HOTEL_KEY`
- `SUPPLIER_BOOK_TRANSFER_URL`
- `SUPPLIER_BOOK_TRANSFER_KEY`
- `SUPPLIER_BOOK_EXPERIENCE_URL`
- `SUPPLIER_BOOK_EXPERIENCE_KEY`

The VEYORA orchestrator sends `Authorization: Bearer <KEY>` and `Idempotency-Key` headers.

## Request

`POST <SUPPLIER_BOOK_*_URL>`

```json
{
  "bookingId": 123,
  "componentId": 456,
  "componentType": "flight",
  "offerId": "supplier-offer-id",
  "offer": {},
  "idempotencyKey": "bk_123_cp_456",
  "expectedPrice": 125.00,
  "currency": "USD",
  "travelers": [{"firstName": "Test", "lastName": "Traveler"}],
  "contact": {"email": "test@example.invalid", "phone": "+998900000000"}
}
```

The `offer` object is the original normalized live supplier offer saved at search/cart time. The adapter is responsible for converting it to its provider-specific booking payload.

## Success response

Return HTTP 2xx only for an actual confirmed reservation, with applicable fields below:

```json
{
  "bookingId": "provider-booking-id",
  "confirmationCode": "ABC123",
  "pnr": "ABC123",
  "ticketNumber": "1234567890123",
  "voucherUrl": "https://..."
}
```

At least one nonempty string supplier identifier is required. Flights require an actual PNR/confirmation, not an order ID substituted as a PNR. Non-flight services require `bookingId` or a confirmation. An optional `status` must be `confirmed` or `ticketed`. Pending responses must be reconciled, not represented as confirmed. Document URLs must use HTTPS. A flight with a PNR but no issued ticket is not travel-ready.

## Error response

Return non-2xx with a machine-readable or human-readable error:

```json
{
  "error": "Offer expired"
}
```

The orchestrator atomically claims each component before its first external request. Any attempted request with an unknown outcome remains reserved for reconciliation. Neither forceRetry nor the retry endpoint may automatically resend it. Operators must retrieve the supplier's status before deciding whether a further attempt is safe. Adapters MUST honor `Idempotency-Key`; forwarding a key does not itself prove that a provider supports idempotency. The built-in Amadeus route relies on the orchestrator's durable claim and must not be called independently as a retry mechanism.

## Required adapter rules

1. Never book demo inventory.
2. Revalidate price/availability before final booking when the provider supports it.
3. Treat the idempotency key as a unique booking operation.
4. Do not silently substitute a materially different itinerary, room, rate, transfer, or experience.
5. Return provider identifiers and customer documents when available.
6. Do not expose provider secret keys to the browser.
7. Log provider request IDs, but do not log card data or sensitive traveler identity documents.
8. Enforce the server's `expectedPrice` ceiling and exact `currency` before creating a reservation. Do not apply an undisclosed price-increase tolerance.
9. Validate provider-required occupancy, ages, pickup details, booking questions and cancellation terms before sending any reservation request.

## Operating limitations

Provider-specific hotel/transfer/experience adapters and supplier approval are still required. The shared guards are not implementations of those providers' booking APIs. A timeout requires manual reconciliation. Ticket numbers are preserved in confirmation events and exposed by booking-status for ticketed components. Travel-ready notifications are emitted only on the paid-to-confirmed transition; failed or uncertain notification delivery needs operations review. There is no automatic durable delivery worker yet.

## Recommended provider-specific flow

### Flights
Search offer -> price/revalidate -> create order/booking -> return PNR -> ticket if provider supports immediate ticketing.

### Hotels
Search rate -> recheck rate -> create reservation -> return hotel confirmation -> voucher URL if available.

### Transfers
Search quote -> revalidate -> create transfer -> return supplier booking reference -> voucher URL if available.

### Experiences
Search activity -> revalidate slot -> create booking -> return confirmation/voucher.
