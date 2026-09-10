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
  "idempotencyKey": "bk_123_cp_456_supplier_offer"
}
```

The `offer` object is the original normalized live supplier offer saved at search/cart time. The adapter is responsible for converting it to its provider-specific booking payload.

## Success response

Return HTTP 2xx and any applicable fields below:

```json
{
  "bookingId": "provider-booking-id",
  "confirmationCode": "ABC123",
  "pnr": "ABC123",
  "ticketNumber": "1234567890123",
  "voucherUrl": "https://..."
}
```

At least one stable supplier identifier should be returned. For air bookings, `pnr` or `confirmationCode` is expected. For hotel/transfer bookings, `bookingId` or `confirmationCode` is expected. `voucherUrl` is optional.

## Error response

Return non-2xx with a machine-readable or human-readable error:

```json
{
  "error": "Offer expired"
}
```

VEYORA stores the failure on the booking component and permits an admin-safe retry. Because retries can occur, adapters MUST honor the `Idempotency-Key` header and must not create duplicate reservations for the same key.

## Required adapter rules

1. Never book demo inventory.
2. Revalidate price/availability before final booking when the provider supports it.
3. Treat the idempotency key as a unique booking operation.
4. Do not silently substitute a materially different itinerary, room, rate, transfer, or experience.
5. Return provider identifiers and customer documents when available.
6. Do not expose provider secret keys to the browser.
7. Log provider request IDs, but do not log card data or sensitive traveler identity documents.

## Recommended provider-specific flow

### Flights
Search offer -> price/revalidate -> create order/booking -> return PNR -> ticket if provider supports immediate ticketing.

### Hotels
Search rate -> recheck rate -> create reservation -> return hotel confirmation -> voucher URL if available.

### Transfers
Search quote -> revalidate -> create transfer -> return supplier booking reference -> voucher URL if available.

### Experiences
Search activity -> revalidate slot -> create booking -> return confirmation/voucher.
