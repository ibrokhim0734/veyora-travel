# VEYORA Production Supplier Integration

## Current architecture
Customer search -> cart -> preflight -> booking -> Stripe -> verified webhook -> paid booking -> supplier orchestrator -> confirmation/PNR/voucher -> tracking.

## Important production rule
Search inventory and booking/ticketing inventory must never be treated as the same thing. A component can only be auto-fulfilled when `inventory_mode=live` and a booking adapter is configured.

## Flight adapter contract
Environment variables used by `supplier-orchestrator`:
- `SUPPLIER_BOOK_FLIGHT_URL`
- `SUPPLIER_BOOK_FLIGHT_KEY`

Request sent by VEYORA:
```json
{
  "bookingId": 123,
  "componentId": 456,
  "offerId": "supplier-offer-id",
  "offer": {},
  "traveler": {}
}
```

Expected adapter response:
```json
{
  "bookingId": "supplier-order-id",
  "confirmationCode": "ABC123",
  "ticketNumber": "optional-ticket-number",
  "voucherUrl": "optional-url"
}
```

For Amadeus production, use an Enterprise booking/order product appropriate to the commercial agreement. Do not assume search credentials permit ticket issuance.

## Hotel adapter contract
Environment variables:
- `SUPPLIER_BOOK_HOTEL_URL`
- `SUPPLIER_BOOK_HOTEL_KEY`

Expected response:
```json
{
  "bookingId": "hotel-order-id",
  "confirmationCode": "HOTEL123",
  "voucherUrl": "https://..."
}
```

Before hotel booking, revalidate the selected offer/price/availability when the provider requires it.

## Transfer adapter contract
Environment variables:
- `SUPPLIER_BOOK_TRANSFER_URL`
- `SUPPLIER_BOOK_TRANSFER_KEY`

Expected response follows the same confirmation/voucher contract.

## Safety / money rules
1. Never issue a supplier booking from DEMO inventory.
2. Never run automatic supplier fulfillment before `payment_status=paid` unless VEYORA deliberately implements a deposit/hold workflow with the supplier.
3. Persist supplier order ID, PNR/confirmation, ticket number and voucher URL.
4. Keep supplier booking operations idempotent. A retry must retrieve/reuse an existing supplier order instead of creating a duplicate booking.
5. If price changes between search and booking, stop fulfillment and return the component for customer/admin approval instead of silently charging more.
6. Log supplier request IDs and sanitized errors; never log card data or secrets.

## Current blocker
VEYORA needs commercial production booking credentials/contracts for each supplier that will actually issue/reserve inventory. Amadeus' current developer portal is Enterprise-focused, so production access should be requested through the Enterprise API program. Once credentials and the exact booking APIs are approved, implement the adapters behind the contracts above without changing the customer checkout flow.
