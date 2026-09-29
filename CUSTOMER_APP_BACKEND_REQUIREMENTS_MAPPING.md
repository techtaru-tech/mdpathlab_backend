# Customer App Backend Requirements — Mapping Against the Live Backend

**Answering:** `BACKEND_REQUIREMENTS.md` (Flutter customer app, sent by the app dev via Yash).
**Source of truth:** the actual live backend at `mdpathlab.techtaru.in/api` — this NestJS/Prisma repo.

The short version: **most of what's asked for already exists** — this backend has been live
serving the web storefront for months, so auth, catalogue, cart, coupons, orders, slots,
addresses, family members, wallet and prescriptions are all real, working endpoints today, just
under slightly different paths/shapes than the doc assumed (it was written against a
from-scratch mock, not against this backend). A handful of things genuinely don't exist yet —
those are called out explicitly at the end, not silently skipped.

Every path below is relative to `https://mdpathlab.techtaru.in/api`.

---

## 1. Auth & Session — ✅ exists, minor naming differences

| Doc asked for | What actually exists | Notes |
|---|---|---|
| `POST /auth/otp/request` | `POST /auth/otp/request` | Same. Rate-limited 5/min. |
| `POST /auth/otp/verify` → `isNewUser` | `POST /auth/otp/verify` → `{ accessToken, user: { id, phone, name, role, isProfileComplete } }` | Same idea, inverted flag: `isProfileComplete: false` ⇔ your `isNewUser: true`. No `refreshToken` — access tokens are long-lived (JWT expiry, no refresh flow exists anywhere in this backend). |
| `POST /auth/profile` (first-time) | Not separate — use `PATCH /auth/me` for this too | One endpoint handles both first-time completion and later edits. |
| `GET /auth/me` | `GET /auth/me` | Same. |
| `PATCH /auth/me` | `PATCH /auth/me` — `{ name, email, dob, gender, city }` | `age` isn't a stored field — the app should send/derive from `dob` (ISO date) instead, or ask backend to add a computed `age` to the response. No `photoPath`/photo upload endpoint exists yet — genuine gap, see §17. |
| `POST /auth/logout` | Doesn't exist | Stateless JWT, nothing to invalidate server-side today. Client just discards the token. If you need server-side revocation (e.g. "log out all devices"), that's new work — flag if needed. |

---

## 2. Location & Serviceability — ⚠️ partially exists

| Doc asked for | What actually exists | Notes |
|---|---|---|
| `GET /locations/cities` → `{ id, name, state, isServiceable, hasHomeCollection }` | `GET /cities` → `{ id, name, slug, isActive }` | Same list, fewer fields. No `state`, no `hasHomeCollection` per city (home-collection coverage is actually determined per-**address pincode** against partner labs, not per-city — see below). `isActive` ⇔ your `isServiceable`. |
| `GET /locations/serviceability?lat=&lng=` or `?pincode=` | `POST /labs/serviceability` — `{ pincode, items? }` → `{ available, labId }` | Different shape and **requires cart items** to give a real answer (a lab must cover the pincode *and* stock every item in the cart) — pass `items: []` for a pincode-only check. No lat/lng variant — pincode only. This is the real, live serviceability check (same one checkout uses), not a mock. |
| `GET /locations/centres?city=&lat=&lng=` → with `distanceKm` | `GET /collection-centers` → `{ id, name, address, phone, lat, lng }` | **No `distanceKm`, no `timings`.** Distance-from-point math already exists server-side (`haversineKm` in `OrdersService.computeHomeCollectionFee`) but isn't exposed as a standalone endpoint — straightforward to add if needed (see §17). |

**Important correction to the doc's mental model:** this backend's actual serviceability logic is
**pincode + partner-lab-coverage**, not a flat per-city on/off flag. A city can have some
serviceable pincodes and some not, depending on which partner labs cover which pincodes (see
`Lab.servicePincodes` + `LabCatalogueItem`). If the app's UX is "pick a city, get a yes/no,"
that's a simplification worth revisiting — the real answer is address/pincode-level.

---

## 3. Catalogue (Tests & Packages) — ✅ mostly exists, search is the one real gap

| Doc asked for | What actually exists | Notes |
|---|---|---|
| `GET /catalog/categories?city=` | `GET /catalogue/categories?cityId=` | Same. Category ids are admin-managed slugs (`full-body-checkup`, `heart`, `cancer`, `thyroid`, `diabetes`, `pregnancy`, `allergy-intolerance`, `hormone`, `dna-test`, plus **`radiology`** as of this session) — not the 9 the doc's mock hardcodes (`full-body`, `liver`, `kidney`, `vitamins`, `senior` don't currently exist as categories; `women`→ likely maps to nothing yet). Reconcile category ids with the app dev before hardcoding icons. |
| `GET /catalog/items?type=&categoryId=&city=&...&sort=&page=&pageSize=` | `GET /catalogue/tests?cityId=`, `GET /catalogue/packages?cityId=`, and now `GET /catalogue/radiology?cityId=` | **Three separate lists, not one unified `type=test|package` endpoint.** No server-side price-range/collection-type/report-time filter or sort, and **no pagination** — the whole active list comes back every time (web app filters/sorts/paginates client-side). Fine at current catalogue size; will need real query params if the catalogue grows a lot. |
| `GET /catalog/items/:id?city=` | `GET /catalogue/tests/:slug?cityId=`, `.../packages/:slug`, `.../radiology/:slug` | **By slug, not by id** — the app should route detail pages by slug (which the list responses already include), not a numeric/opaque id. |
| `GET /catalog/items/:id/related?city=` | Doesn't exist as a dedicated endpoint | Web app just fetches the full list and picks 4 client-side. Fine to do the same in the app rather than requesting a new endpoint. |
| `GET /catalog/search?q=&city=` | **Doesn't exist.** | Real gap — see §17. |

---

## 4. Cart, Coupons & Pricing — ✅ exists, server-side (matches the doc's "recommended" choice)

| Doc asked for | What actually exists | Notes |
|---|---|---|
| `GET /cart` | `GET /cart` → `{ items, subtotal }`, each item resolved with live catalogue price | Same. |
| `POST /cart/items` `{ itemId, patientId }` | `POST /cart` — `{ itemType, itemId, familyMemberId? }` | **Needs `itemType`** (`PARAMETER`/`PROFILE`/`PACKAGE`/`RADIOLOGY`) alongside the id — this backend's catalogue spans several tables, so itemType always comes from whatever list/detail response the app just read, never guessed. `patientId` → `familyMemberId` (optional; omitted = booking for the account holder themself). Duplicate (same item+patient) is already rejected at the DB level. |
| `DELETE /cart/items/:itemId?patientId=` | `DELETE /cart/:id` (the cart *row* id, not the catalogue item id) | |
| `PATCH /cart/items/:itemId` (change patient) | `PATCH /cart/:id` — `{ familyMemberId }` | |
| `POST /cart/coupon`, `DELETE /cart/coupon` | Not on the cart itself — coupon is applied at **quote/checkout time**: `POST /orders/quote` and `POST /orders/checkout` both take an optional `couponCode` | No persisted "coupon applied to my cart" state — the app should hold the applied code client-side (like the web app does) and pass it on every quote/checkout call. |
| `PATCH /cart/wallet` `{ useWallet }` | Same pattern — `useWallet: bool` is a param on `/orders/quote` and `/orders/checkout`, not a persisted cart toggle | |
| `DELETE /cart` | `DELETE /cart` | Same. |
| `GET /coupons?cartTotal=` | `GET /coupons` (list available) + `POST /coupons/apply` `{ code, cartTotal }` (validate against a total) | Split into two calls rather than one list-with-eligibility-flags — combine client-side if needed. |
| Discount formula | `min(flatOff + floor(itemTotal * percentOff / 100), maxDiscount ?? ∞, itemTotal)` | **Confirmed identical** to `CouponsService.computeDiscount()` — safe to trust the server's number. |
| `GET /pricing/summary` | `POST /orders/quote` → `{ subtotal, discount, collectionFee, feeCalculable, distanceKm, withinRange, nearestCentreName, walletBalance, walletUsed, total }` | This already **is** the single-source-of-pricing-truth the doc asks for — same numbers checkout actually charges. |
| Collection fee: ₹99 home, waived ≥₹499, ₹0 lab visit | **Different real rule** — see below | |

**Correction — the actual collection-fee rule is NOT a flat ₹99/₹499 threshold.** It's
distance-tiered from the nearest active `CollectionCenter` (env-configurable, current defaults:
free ≤5km, ₹100 for 5–10km, ₹200 beyond), *unless* a partner lab covers the address's pincode
(then it's always ₹0 — see §2's serviceability correction). The doc's hardcoded ₹99/₹499 numbers
don't match live behavior and should be dropped from the app; use the real numbers `/orders/quote`
returns instead of hardcoding.

---

## 5. Home, Search & Discovery — ⚠️ no aggregate endpoint

There's no single `GET /home` — the web app calls `/catalogue/categories`, `/catalogue/tests`,
`/catalogue/packages`, `/offers`, and reads the logged-in user's own orders separately, and
assembles the Home screen client-side from those. Building one aggregate `/home` endpoint (or
just having the app make those same 4–5 calls itself, which is honestly simpler and each one
already supports `cityId`) is a real, small option to weigh — see §17.

`GET /offers` already exists (banners) — no explicit `city` filter on it today.

City-scoping status per section: categories/tests/packages/radiology already accept `cityId` and
apply that city's `CityPrice` overrides; **none of them currently hide an item entirely for a
city** except Test/Package/Parameter, which hide when no `CityPrice` row exists for that city at
all (Radiology was deliberately made to *never* hide by city — see this repo's own
`catalogue.service.ts` comment on why). If "different catalogue per city" (not just different
price) is really required, today's actual mechanism is "no CityPrice row ⇒ hidden," which needs
an admin to have set city pricing per item — it's not a first-class "which cities sell this"
toggle.

---

## 6. Family Members & Addresses — ✅ exists

| Doc asked for | What actually exists |
|---|---|
| `GET/POST/PATCH/DELETE /family-members` | `GET/POST /patients/me/family-members`, `PATCH/DELETE /patients/me/family-members/:id` |
| Relation→gender inference | Not enforced server-side — the app can keep doing this client-side (harmless; the field is just stored as given). |
| "Self" as a synthetic row | Correct as the doc guesses — there's no real "Self" FamilyMember row; a cart/order line with no `familyMemberId` means "the account holder." Keep synthesizing it client-side. |
| `GET/POST/PATCH/DELETE /addresses` | `GET/POST /patients/me/addresses`, `PATCH/DELETE /patients/me/addresses/:id` |
| `POST /addresses/:id/select` (mark default) | Covered by `PATCH /patients/me/addresses/:id` — check the DTO for an `isDefault` field (it exists on the model). |
| `lat`/`lng` required for new addresses | **Not actually enforced** — both are optional today. Home-collection fee/serviceability degrade gracefully without them (fee becomes "not calculable," shown as a warning) but nothing blocks saving an address with no coordinates. Worth tightening if the app wants to guarantee phlebotomist-navigable addresses. |

---

## 7. Checkout & Booking Slots — ✅ exists, already real (not a mock)

| Doc asked for | What actually exists |
|---|---|
| `GET /slots?date=&city=&centreId=` | `GET /slots?date=&collectionType=HOME\|CENTER&collectionCenterId=` → `[{ id, label, startTime, endTime, available, remainingCapacity }]` — real, admin-configured capacity per slot/date/scope, not a formula. |
| `GET /slots/availability?fromDate=&days=&city=` (date-strip summary) | **Doesn't exist** — the app would need to call the per-day endpoint once per date to build a strip. Small, cheap addition if wanted (§17). |
| 4-step checkout (collection type → address/lab → slot → payment) | `POST /orders/checkout` takes it all in one call: `collectionType`, `addressId`/`collectionCenterId`, `slotId`, `scheduledDate`, `paymentMethod`, `couponCode?`, `useWallet?`, `items[]` — the *screens* can still be 4 steps client-side; the API is one final submit, mirroring `POST /orders/quote`'s shape for the running total along the way. |
| Online payment via Razorpay | **Already real, not faked** — `POST /orders/:id/razorpay/create-order` + `POST /orders/:id/razorpay/verify`, plus a server-side webhook fallback so payment confirmation doesn't depend solely on the app completing the verify call (important if the app is killed mid-payment). Use the **Razorpay mobile SDK**, not web checkout.js. |
| Wallet-changed-mid-checkout race condition | **Already handled** — checkout re-reads the live wallet balance and order pricing inside one DB transaction; nothing client-supplied is trusted for the actual charge. |

---

## 8. Bookings, Tracking & Reports — ⚠️ partially exists

| Doc asked for | What actually exists |
|---|---|
| `GET /bookings?status=` | `GET /orders` (all of a user's own orders, one list — no status-tab query param; filter client-side same as the web app does, or ask backend to add one) |
| `GET /bookings/:id` | `GET /orders/:id` — includes items, slot, address/collection-centre, **matched partner lab** (`lab: { id, name, address }` — new as of this session, useful for radiology/multi-lab bookings), phlebotomist (once assigned), status log timeline, approved reports, coupon, review. |
| `POST /bookings/:id/cancel` | `POST /orders/:id/cancel` — enforces the cancellation window (env-configurable hours before the slot) server-side. |
| Refund rule: `walletUsed + (online ? payable : 0)` | **Confirmed close, one correction**: wallet-used is always refunded to wallet on cancel — confirmed. But the online-paid portion is **not currently auto-refunded to the gateway or the wallet** on cancel; cancellation only reverses the wallet debit. If "online payments get refunded to wallet on cancel" is a hard requirement, that's new work, not existing behavior — flag before assuming it. |
| `GET /bookings/:id/track` (live phlebotomist GPS) | **Doesn't exist.** The phlebotomist app has `reachedAt`/`onTheWayAt` timestamps and a doorstep OTP (see `PHLEBOTOMIST_APP_SPEC.md`), but no live lat/lng ping feed exists anywhere in this backend today. Real gap if "live tracking" means an actual moving pin — see §17. |
| Push on every status change | **Already real** — `NotificationsService.notifyUser()` fires on checkout, cancel, phlebotomist assignment/accept/on-the-way/reached/sample-collected, lab status updates, admin status changes. Requires the app to register a device token first (see §13 — this session just fixed a bug blocking native `ANDROID`/`IOS` token registration, now live). |
| `GET /reports`, `GET /reports/:bookingId` (structured parameter+flag JSON) | **Partially — real gap.** A customer's own reports only ever come back as `{ id, fileUrl, status, approvedAt }` (a PDF) nested in the order response — there's no per-parameter `{ parameter, value, unit, range, flag }` JSON for customers. That structured data *does* exist server-side (`LabResultValue`, used by the lab's own result-entry screen and the auto-PDF generator) but isn't exposed to the customer API today. Real gap if the app wants an in-app results view rather than "open this PDF" — see §17. |

---

## 9. Wallet — ✅ exists, no auto welcome-bonus

| Doc asked for | What actually exists |
|---|---|
| `GET /wallet` → balance + ledger | Same. |
| Signup welcome bonus (₹250) | **Doesn't exist** — nothing credits new users automatically today. Real gap, small to add (§17). |
| Cancellation refund credit | Exists (see §8). |
| Debit on checkout when `useWallet=true` | Exists. |
| Top-up flow | The doc says the app has none — **this backend actually has one already** (`POST /wallet/topup/order` + `/topup/verify`, same Razorpay pattern as checkout) that the web app uses. Worth deciding whether the mobile app should expose it too rather than leaving wallet balance to only grow via bonus/refunds. |

---

## 10. Prescriptions — ✅ exists

`POST /prescriptions` (multipart, `{ file, orderId?, note? }`) and `GET /prescriptions/me` (note:
**`/me` suffix**, not bare `GET /prescriptions`). Already wired into a real lab-routing +
admin-review pipeline (pincode-matched to the nearest partner lab, reviewed, tests recommended
back) — this is a whole feature already, not just a file-upload stub.

---

## 11. Notifications feed — ❌ real gap

Only push **delivery** exists (`POST/DELETE /notifications/device-token`). There is **no**
persisted in-app notification list (`GET /notifications`, mark-read, mark-all-read) anywhere in
this backend — every "notification" is a fire-and-forget Firebase push with no server-side
history a client can re-fetch after the fact. If the app wants an in-app notification feed/bell
icon with history, that's new work end-to-end (a table + 3 endpoints) — see §17.

---

## 12. Static / Support Content — ✅ mostly exists

| Doc asked for | What actually exists |
|---|---|
| `GET /legal/:doc` (privacy/terms) | `GET /settings` → `{ privacyPolicyContent, termsConditionsContent, ... }` — same content, bundled into the general public settings response rather than a dedicated path per doc. |
| `GET /support/faq` | **Doesn't exist.** |
| Support contact | Already in `GET /settings` → `{ address, email, phone }`. |

---

## 13. Config / Feature flags — ⚠️ partial

`GET /settings` already exposes `onlinePaymentEnabled`, `codEnabled`, branding
(`logoUrl`/`faviconUrl`/`bannerUrl`), Razorpay key id, and the legal content above — genuinely the
same idea as the doc's `GET /config` ask, just not including the fee/bonus constants:
`homeCollectionFee`/`freeCollectionAbove` (see §4's correction — the real rule is distance-tiered,
env-configured, not exposed via any API today), `walletWelcomeBonus` (doesn't exist, see §9),
`bookingDaysAhead`, `otpLength`/`otpResendSeconds` (`OTP_TTL_SECONDS`/`OTP_RESEND_COOLDOWN_SECONDS`
env vars, not returned in the OTP request response beyond `expiresInSeconds`, which the app
already gets). `GET /locations/cities` **should** replace the hardcoded city list (see §2).

---

## 14. Device tokens / push — ✅ exists (bug just fixed)

`POST /notifications/device-token` `{ token, platform? }`. **Until this session, `platform` only
accepted `"WEB"`** — a native app correctly sending `"ANDROID"`/`"IOS"` got its registration
silently rejected (400), meaning it could never receive pushes. **Fixed and deployed live today**
— `ANDROID`/`IOS` are now accepted. If the Flutter app already tried registering and got
rejected before, it should retry now.

---

## 15. What genuinely doesn't exist yet — priority-ordered gap list

1. **`/catalog/search`** — no server-side search across tests/packages/radiology today.
2. **Structured per-parameter report results** (`{ parameter, value, unit, range, flag }`) for
   customers — only a PDF link exists in the customer-facing API today; the structured data
   exists server-side but isn't exposed to this realm.
3. **In-app notification feed** (list + read/unread) — push-only today, no history.
4. **Wallet signup welcome bonus** — small, no auto-credit trigger exists.
5. **`GET /home` aggregate** — optional; the pieces all already exist as separate, city-aware
   calls.
6. **`/locations/serviceability` by lat/lng** (only pincode exists) and **`distanceKm`/`timings`
   on `/collection-centers`** — the distance math already exists server-side, just not exposed
   standalone.
7. **Live phlebotomist GPS tracking feed** — timestamps/OTP exist, no live location ping.
8. **`GET /support/faq`**.
9. **Fee/bonus constants via API** (`homeCollectionFee`, `walletWelcomeBonus`,
   `bookingDaysAhead`, etc.) — currently env vars only.
10. Photo upload for profile picture.
11. Server-side session revocation / logout (stateless JWT today).

None of these are large individually — most are a single new controller method or one new
field — but they're genuinely not there today, unlike everything above them in this document.

---

## 16. Correcting three of the doc's assumed business rules

These three numbers/rules in the original doc **don't match live behavior** — the app should use
the server's real numbers, not these hardcoded ones:

1. Collection fee is **distance-tiered from the nearest collection centre** (or ₹0 if a partner
   lab covers the address), not a flat ₹99/waived-≥₹499 rule.
2. Serviceability is **pincode + partner-lab-coverage**, not a per-city flag.
3. Cancellation refund does **not** currently refund an online payment's gateway-charged amount —
   only wallet-used is reversed.

---

## 17. If you want the real gaps built

Say which of the §15 list to prioritize and in what order — most are small, scoped, low-risk
additions to this same backend (new controller method + maybe one migration), not a rewrite.
