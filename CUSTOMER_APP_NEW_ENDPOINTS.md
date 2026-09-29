# Customer App — Newly Added Endpoints (Live)

**For:** the Flutter customer app developer.
**Status:** all of the following are **live now** on `https://mdpathlab.techtaru.in/api` — this
closes every gap listed in §15 of `CUSTOMER_APP_BACKEND_REQUIREMENTS_MAPPING.md`. That earlier
document is still the full picture (what already existed vs. what didn't); this one is just the
"here's exactly how to call the 9 things that were missing" reference, verified end-to-end on
this live server before being sent.

---

## 1. Catalogue search

```
GET /catalogue/search?q=<text>&cityId=<optional>
```
No auth needed. Searches tests, packages and radiology together (matches name, category, and for
tests also the parameters it covers). Response:
```json
{ "tests": [ ...same shape as GET /catalogue/tests... ],
  "packages": [ ...same shape as GET /catalogue/packages... ],
  "radiology": [ ...same shape as GET /catalogue/radiology... ] }
```
Empty `q` returns all-empty arrays rather than the whole catalogue — always require at least one
character client-side before calling.

---

## 2. Structured report results

```
GET /orders/:id/results
Authorization: Bearer <token>
```
Returns `400` with a clear message until the order has at least one **APPROVED** report — don't
show a results screen before that. Once approved:
```json
[ { "parameter": "Complete Blood Count (CBC)", "value": "15.2", "unit": "x10^9/L",
    "range": "4.0 - 11.0", "flag": "High" } ]
```
`flag` is `"High"` / `"Low"` / `null` — **only ever computed** when `range` is a plain numeric
"low - high" span and `value` itself parses as a number. Many real ranges are text like
"Negative" or "Male: 13-17, Female: 12-15" — those always come back `flag: null`, which is
correct, not a bug; show the raw `range` string regardless so the patient still sees it.

---

## 3. In-app notification feed

```
GET /notifications                    → array, newest first, up to 100
POST /notifications/:id/read          → marks one read
POST /notifications/read-all          → marks everything read
```
All auth'd. Each item:
```json
{ "id": "...", "title": "Sample collected", "body": "Order MDP-... — your sample has been collected",
  "kind": "BOOKING", "data": { "type": "ORDER_STATUS", "orderId": "...", "status": "SAMPLE_COLLECTED" },
  "readAt": null, "createdAt": "2026-09-29T..." }
```
`kind` is one of `BOOKING` / `REPORT` / `OFFER` / `WALLET` / `GENERAL` — use it for the feed's
filter tabs. This is a real, persisted history now (independent of whether the push notification
itself actually reached the device) — still register a device token (§ below) to get real-time
pushes too; this feed is the "catch up on what I missed" complement to that, not a replacement.

---

## 4. Wallet signup bonus

No new endpoint — **automatic**. The first time a phone number ever completes OTP verify
(`POST /auth/otp/verify`), ₹250 is credited to that new account's wallet before the response is
even returned. Nothing for the app to call; just show the wallet balance as usual afterward
(`GET /wallet`) and it'll already reflect it.

---

## 5. Home aggregate

```
GET /home?cityId=<optional>
```
No auth needed.
```json
{ "categories": [...], "popularTests": [...up to 8...], "popularPackages": [...up to 8...],
  "radiology": [...up to 8...], "offers": [...] }
```
Deliberately has **no `upcomingBooking`** — call `GET /orders` yourself (authenticated) when the
user is logged in and take the nearest upcoming one client-side, same as the reference web app
does. Every list here honors `cityId` exactly like the individual catalogue endpoints already did.

---

## 6. Collection centres with distance

```
GET /collection-centers?lat=<optional>&lng=<optional>
```
With both params, each row gets a `distanceKm` (rounded to 1 decimal) and the list is sorted
nearest-first. Without them (or if a centre has no stored coordinates), `distanceKm: null` — same
as before, just an added field, nothing breaks if you don't pass lat/lng at all.

---

## 7. Live phlebotomist tracking

```
GET /orders/:id/track
Authorization: Bearer <token>
```
```json
{ "tracking": true, "phlebotomist": { "name": "Rajesh Kumar", "phone": "91111..." },
  "lat": 26.912, "lng": 75.787, "updatedAt": "2026-09-29T10:10:44Z" }
```
`tracking: false` (with everything else `null`) until the order's `onTheWayAt` is set — there's
nothing to point a map at before the phlebotomist has actually started heading over, and nothing
left to track after sample collection. Poll this on an interval while `tracking: true`, same as
you'd poll any REST endpoint for a moving pin — it's the phlebotomist app's last self-reported
ping, not a websocket stream.

*(For completeness, not something this app calls: the phlebotomist app itself reports its position
via `POST /phlebotomist/location` `{ lat, lng }` — that's the write side this reads from.)*

---

## 8. FAQ

```
GET /support/faq
```
No auth. `[{ id, topic, question, answer, sortOrder, status, createdAt, updatedAt }]` — group by
`topic` client-side for the Help & Support screen's sections. Admin-managed; empty until someone
adds content via the admin panel (no dedicated FAQ admin UI exists yet either — flag if you need
one before launch, it's a small addition).

---

## 9. Config constants

```
GET /settings
```
(Same endpoint as before — just now has one more field.) Response now includes:
```json
"config": {
  "homeCollectionFee": { "freeKm": 5, "tier2Km": 10, "tier2Fee": 100, "tier3Km": 20, "tier3Fee": 200 },
  "walletSignupBonus": 250,
  "otpLength": 6,
  "otpResendSeconds": 30,
  "otpExpirySeconds": 300,
  "cancellationWindowHours": 2
}
```
Drop every hardcoded version of these numbers from the app (`AppConstants.otpResendSeconds`, the
₹99/₹499 collection-fee constants, etc.) and read them from here instead — see the mapping doc's
§16 for why the old hardcoded fee numbers were wrong to begin with (the real rule is
distance-tiered, exactly what `homeCollectionFee` describes).

---

## One thing still not built

There's no admin UI to manage FAQ content yet (item 8 above) — the backend/DB side is there, just
no screen. Say if you need it before this ships and it's a quick add.
