# VEYORA launch audit — 21 September 2026

Target: full launch on 23 September 2026. **Not ready for unrestricted paid launch.**

## Verified baseline

- Main was `745cf090843a61711ca2c13cddc10a6fe5539765`. GitHub reports the Vercel check as success. Direct Vercel project/deployment access is unavailable through the connected account (empty project list; deployment lookup failed). Production alias, runtime logs and build duration are not verified.
- Supabase project `neckklsrofckomgmbcjg` is accessible. Read-only schema inspection confirms the fulfillment columns, unique fulfillment-key index and unique Stripe event-ID index.
- The deposit table is `pricing_config`, not `pricing_settings`.
- At audit time there were 15 bookings in `new` status and no booking components. No customer data was modified for testing.

## Changes in this release

- Compare-and-set claim before supplier calls; ambiguous outcomes cannot be rebooked by forceRetry. Explicit LIVE inventory, valid prices, stable offer IDs, service details and named travelers are required.
- Reject empty/unconfirmed supplier results and unsafe document URLs. Check persistence errors. Keep confirmation and ticket evidence in the event ledger.
- Flight adapter requires a production host, calendar-valid traveler dates, authorized price/currency and a real PNR. Repricing cannot silently increase the authorized amount. PNR alone does not mark a flight travel-ready.
- Notification eligibility checks, persisted attempt records, provider idempotency key and timeout. Ambiguous attempts require reconciliation. No actual emails sent.
- Tracking hides internal event payloads/admin notes, validates document URLs, exposes issued ticket numbers and reports component-query errors instead of silently returning an empty itinerary.
- Checkout uses `pricing_config`, rejects cancelled/review bookings and missing supplier adapters, validates amounts/currency and uses the configured return origin. Two-decimal currency allowlist is explicit; other currencies are blocked pending implementation.
- Stripe webhook requires `payment_status === 'paid'` and a numeric, timely signature timestamp.
- Offline Node 24 regression tests cover supplier, notification and Stripe boundaries; every external operation is mocked.

## Remaining launch blockers

1. **Atomic payment ledger and dispatch.** The webhook still updates balances and inserts event rows separately. A row lock plus session/payment-intent deduplication and a transactional outbox are required. Existing event-ID uniqueness alone does not solve concurrent updates or two event IDs for one Checkout Session. Paid-event duplicates can also skip recovery of failed dispatch. Do not interpret the signature/status fixes as resolving this.
2. **Supplier approval and provider implementation.** Hotel, transfer and experience currently use configurable adapter URLs; no in-repository provider booking implementations or certification evidence exist. Production environment configuration could not be verified. Amadeus order creation also does not prove ticket issuance rights or automated ticketing support.
3. **Schema reproducibility.** The database contains 24 migration records, but the repository contains two view migrations. Baseline schema and traveler-table changes are not reproducible from the repository. CLI migration creation was denied by the local approval gate; no schema change was applied. The existing retry view's three-attempt description is now more permissive than the orchestrator, which blocks any already-attempted operation until reconciliation.
4. **Durable reconciliation/delivery.** Supplier timeouts, crashes after claiming, partial-package failure, failed notifications and supplier cancellations need an operations workflow and durable queue. No background dispatcher was enabled. Concurrent cancellation/refund versus fulfillment needs transactional coordination.
5. **Pre-payment offer authenticity.** Cart preflight checks stored mode/price but does not itself revalidate the actual supplier offer. Server-created quotes, expiry checks and provider-specific availability/price validation before charging remain required. Checkout can still create multiple active Stripe sessions; session reuse/expiry belongs in the payment-ledger work.
6. **Production verification.** Vercel project access, provider credentials, email sending-domain verification and a separately authorized sandbox certification run remain necessary. No real supplier or paid transaction was executed.

## Provider research and recommendation

**First commercial candidate: HBX/Hotelbeds** for hotel + transfer + activities. This is an architectural recommendation based on its three documented API suites, not evidence of an existing VEYORA contract or guaranteed approval before 23 September.

- Hotels: availability returns rate keys; RECHECK rates require CheckRates before booking. Existing Amadeus hotel offers cannot be sent to this API; a matching search adapter is required. [Workflow](https://developer.hotelbeds.com/documentation/hotels/booking-api/workflow/) and [certification](https://developer.hotelbeds.com/documentation/hotels/knowledge-base/certification-process/).
- Transfers: booking consumes the provider rate key, passenger contact and applicable arrival/departure details. Separate test/live hosts and certification are documented. [Transfers API](https://developer.hotelbeds.com/documentation/transfers/) and [booking request](https://developer.hotelbeds.com/documentation/transfers/booking-api/booking-post-booking/booking-request/).
- Activities: implement the required questions and voucher data; some products supply voucher URLs while others require generating a compliant voucher from confirmation data. [Certification](https://developer.hotelbeds.com/documentation/activities/knowledge-base/certification/) and [voucher requirements](https://developer.hotelbeds.com/documentation/activities/knowledge-base/voucher-generation/).

**Experience alternative: Viator Merchant API.** It matches VEYORA's own-checkout model, but qualification, certification and a commercial deposit precede live booking. Basic affiliate access redirects customers to Viator and does not replace merchant booking access. Booking-status reconciliation, cancellation and official voucher handling are required. [Merchant program](https://partnerresources.viator.com/travel-commerce/merchant/), [access levels](https://partnerresources.viator.com/travel-commerce/levels-of-access/), [technical guide](https://partnerresources.viator.com/travel-commerce/technical-guide/).

**Existing hotel-search path: Amadeus.** Ask the existing Amadeus account team whether its approved Hotel Booking product and payment/guarantee arrangement cover VEYORA. Search access is not proof of booking access. [Official booking API](https://developers.amadeus.com/enterprise/category/hotel/api/booking).

Provider research used official documentation. No provider account was created, application submitted, deposit paid or supplier contacted. Stripe Directory CLI was not available; no directory results are claimed.

## Release verification

Run `node --test tests/*.test.mjs tests/*.test.cjs` on Node 24. Deployment versions, commit and production status are recorded separately after publication. No full paid end-to-end test has been run.
