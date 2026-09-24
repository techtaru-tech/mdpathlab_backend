# MD Path Labs — Mobile App Development Spec

**For:** the app developer building the **Customer (User) app** and **Phlebotomist app**.
**Source of truth:** this document summarizes the *existing* production backend (NestJS + Prisma + PostgreSQL) and web app (TanStack Start) at `mdpathlab.techtaru.in`. Both apps should be thin clients over the APIs described below — almost nothing here needs new backend work; the phlebotomist API in particular is already built and simply has no app consuming it yet.

---

## 1. What already exists vs. what you're building

| Piece | Status |
|---|---|
| Backend API (auth, catalogue, cart, checkout, payments, wallet, coupons, family members, addresses, order tracking) | **Done, live in production.** Customer app is a UI over this. |
| Phlebotomist-facing API (login, today's assignments, reached/sample-collected/handover, payment collection, history) | **Done, live in production**, but currently has **zero consumers** — only a login screen exists on the web (no assignment dashboard UI anywhere yet). The phlebotomist app is the *first real client* for most of this API. |
| Customer web app (mdpathlab.techtaru.in) | Live — use it as the functional reference for every screen the Customer app needs. |
| Customer/Phlebotomist mobile apps | **Not built yet — this is your task.** |

---

## 2. Domain model (what the data looks like)

One `User` table serves **both** customers and phlebotomists — differentiated by a `role` field (`PATIENT` / `PHLEBOTOMIST`). A phlebotomist has one linked `Phlebotomist` record (employee code, vehicle info, coverage city, status, rating).

Key entities:

- **User** — phone-based identity (phone is the login key), name/email/dob/gender/city, `walletBalance`.
- **FamilyMember** — belongs to a User; the actual "patient" a test is booked for (name, relation, gender, dob **and** age captured directly).
- **Address** — belongs to a User; label, full address fields, lat/lng, default flag.
- **Category / Parameter / Profile / Package** — the catalogue. A `Profile` is a "Test" (bundles Parameters). A `Package` bundles Profiles/Parameters. Both carry price/MRP, sample-collection mode (HOME/LAB/BOTH), report turnaround time, fasting requirements.
- **Coupon** — percent/flat discount, min order value, max discount cap, validity window, usage limits (global + per-user).
- **WalletTransaction** — CREDIT/DEBIT ledger entry; top-ups go through Razorpay.
- **Slot / SlotAvailability** — home-collection time slots, with date + collection-type + collection-center scoping.
- **City / CollectionCenter** — for lab-visit (non-home) bookings.
- **Phlebotomist** — employeeCode, vehicleType/Number, coverageCity, status (ACTIVE/INACTIVE/ON_LEAVE), rating, totalCollections.
- **Order** — the booking. Has its own status machine (see §5), payment status, payment method (ONLINE/COD), collection type (HOME/CENTER), scheduled date/slot, assigned phlebotomist, pricing breakdown (subtotal/discount/collection fee/wallet-amount-used/total), Razorpay ids, and COD-specific fields (`collectedAmount`, `collectionPaymentMode`, `collectedAt`) plus lab-handover fields (`sampleBarcode`, `handedOverAt`).
- **OrderItem** — line items on an order (which test/package/parameter, for which family member).
- **OrderStatusLog** — full audit trail of every status change, who changed it.
- **Report** — the diagnostic report file per order (PENDING → UPLOADED → APPROVED).
- **Prescription** — a photo/PDF a customer uploads so the lab can match tests to what a doctor ordered.
- **DeviceToken** — push-notification token, linked to either a User (patient or phlebotomist) or an AdminUser.

---

## 3. Customer (User) App

### 3.1 Screens to build (mirror the existing web app)

| Screen | Reference web route | Notes |
|---|---|---|
| Home | `/` | Offers, categories, featured packages, search. |
| Test/Package listing & detail | `/tests`, `/tests/:slug`, `/packages`, `/packages/:slug` | Public, no auth needed to browse. |
| Cart | `/cart` | Assign a family member to each item before checkout. |
| Checkout | `/checkout` | Address, slot, coupon, wallet redemption, payment method (online vs. Pay-at-Collection), triggers Razorpay. |
| Booking detail / tracking | `/booking/:orderId` | Status timeline, cancel action, report download once ready. |
| Login / Register | `/login`, `/register` | Phone + OTP only — no passwords. |
| Dashboard ("My Account") | `/dashboard` | Bookings list, wallet & passbook, coupons, family members, prescriptions — bundles most account-level features. |
| Upload Prescription | Hero section dialog on `/` | Upload a prescription photo/PDF, optionally tied to an order. |

### 3.2 API reference

All endpoints are prefixed with the API base URL (production: `https://mdpathlab.techtaru.in/api`). "Auth" = requires `Authorization: Bearer <JWT>` from the OTP login flow.

**Auth** (`/auth`)
| Method & Path | Auth | Purpose |
|---|---|---|
| POST `/auth/otp/request` | Public | Send OTP to phone (rate-limited 5/min) |
| POST `/auth/otp/verify` | Public | Verify OTP → JWT; creates the User if new (rate-limited 10/min) |
| GET `/auth/me` | ✅ | Current profile |
| PATCH `/auth/me` | ✅ | Update name/email/dob/gender/city |
| POST `/auth/change-phone/request` | ✅ | OTP to new phone |
| POST `/auth/change-phone/verify` | ✅ | Confirm phone change |

**Catalogue** (`/catalogue`) — all public
`GET /categories`, `GET /tests`, `GET /tests/:slug`, `GET /packages`, `GET /packages/:slug`

**Cart** (`/cart`) — all ✅
`GET /`, `POST /` (add item), `PATCH /:id`, `DELETE /:id`, `DELETE /` (clear)

**Patients** (`/patients/me`) — all ✅
`GET/POST /family-members`, `PATCH/DELETE /family-members/:id`
`GET/POST /addresses`, `PATCH/DELETE /addresses/:id`

**Orders** (`/orders`) — all ✅
| Method & Path | Purpose |
|---|---|
| POST `/orders/quote` | Price a prospective booking (no order created yet) |
| POST `/orders/checkout` | Create the order |
| GET `/orders` | List own orders |
| GET `/orders/:id` | Booking detail |
| POST `/orders/:id/cancel` | Cancel (optional reason) |

⚠️ **No reschedule endpoint exists today.** If the app needs "reschedule a booking," flag this to the backend dev — it isn't built yet.

**Payments — Razorpay** (on `/orders`)
| Method & Path | Purpose |
|---|---|
| POST `/orders/:id/razorpay/create-order` | Creates a Razorpay order for this booking's total |
| POST `/orders/:id/razorpay/verify` | Client sends payment id + signature after Razorpay Checkout completes; server verifies HMAC and marks order CONFIRMED/PAID |

Use the **Razorpay mobile SDK** (not the web checkout.js) to complete payment client-side, then call `/verify`. A server-side webhook (`POST /webhooks/razorpay`) is already wired as a fallback, so payment confirmation isn't solely dependent on the app completing the verify call (important if the app is killed mid-payment).

**Wallet** (`/wallet`) — all ✅
`GET /` (balance + ledger), `POST /topup/order`, `POST /topup/verify` (same Razorpay create/verify pattern as checkout)

**Coupons** (`/coupons`) — all ✅
`GET /` (list available), `POST /apply` (validate against cart), `POST /activate` (redeem)

**Prescriptions** (`/prescriptions`) — all ✅
`POST /` (upload file, optional orderId/note), `GET /me`

**Device tokens / push** (`/notifications/device-token`) — all ✅
`POST /` (register), `DELETE /` (unregister)

**Public reference data**
`GET /cities`, `GET /collection-centers`, `GET /offers`

---

## 4. Phlebotomist App

This is the higher-priority gap: **the API is fully built but has never had a real client.** Building this app means implementing the first real UI over an already-designed feature set.

### 4.1 Screens to build

| Screen | Backed by |
|---|---|
| OTP Login | `/auth/phlebotomist/otp/request` + `/verify` (existing web login page `phlebotomist.login.tsx` is a working reference for this flow only) |
| Today's Assignments | `GET /phlebotomist/assignments/today` |
| Assignment/Booking Detail | `GET /phlebotomist/orders/:id` |
| "Reached" action | `POST /phlebotomist/orders/:id/reached` |
| "Sample Collected" action | `POST /phlebotomist/orders/:id/sample-collected` |
| Collect Payment (COD only) | `POST /phlebotomist/orders/:id/payment` |
| Handover to Lab (barcode scan) | `POST /phlebotomist/orders/:id/handover` |
| Collection History | `GET /phlebotomist/collections/history` |
| Profile / change phone | `GET /auth/phlebotomist/me`, change-phone endpoints |

### 4.2 API reference (`/phlebotomist`, all require the phlebotomist's own JWT — a different guard from the customer JWT)

| Method & Path | Purpose | Preconditions |
|---|---|---|
| GET `/phlebotomist/assignments/today` | Today's (IST) HOME-collection bookings assigned to this phlebotomist, sorted by slot | — |
| GET `/phlebotomist/orders/:id` | Assignment detail | 404 if not assigned to this phlebotomist (doesn't leak existence) |
| POST `/phlebotomist/orders/:id/reached` | Marks arrival timestamp | — |
| POST `/phlebotomist/orders/:id/sample-collected` | Marks sample collected, moves order status forward, notifies patient | Requires `/reached` called first |
| POST `/phlebotomist/orders/:id/payment` | Records COD payment: `{ amount, paymentMode: "CASH" \| "UPI" }` | Only for COD orders, requires status = SAMPLE_COLLECTED |
| POST `/phlebotomist/orders/:id/handover` | Hands sample to lab: `{ sampleBarcode }`, moves order status forward, notifies patient | Requires status = SAMPLE_COLLECTED |
| GET `/phlebotomist/collections/history` | Date-grouped completed collections with cash/UPI totals | — |

**Auth** (`/auth/phlebotomist`)
`POST /otp/request`, `POST /otp/verify` (public), `GET /me`, `POST /change-phone/request`, `POST /change-phone/verify` (all ✅)

**Push notifications**: `POST/DELETE /phlebotomist/notifications/device-token` — identical pattern to the customer app.

### 4.3 Known gaps — confirm scope with the backend dev before building against these assumptions

1. **No "Reached" order status.** Arrival is only a timestamp (`reachedAt`), not a status the customer's tracking timeline shows. If you want the customer app to show "Phlebotomist has reached," the backend needs a small addition.
2. **No self-service reassignment/decline.** A phlebotomist cannot decline an assignment in the app today — only an admin can reassign, from the admin web panel. Decide if this is in scope for launch.
3. **No live location tracking.** There's no endpoint for the phlebotomist app to ping GPS location. If "track your phlebotomist on a map" is a customer-facing feature you want, this needs to be built.
4. **No per-transition state-machine guard.** Each endpoint checks its own precondition (e.g. "must have reached before collecting"), but there's no central rule engine — don't assume the backend will reject an out-of-order call you didn't anticipate; test each transition's actual precondition directly.

---

## 5. Order lifecycle (shared reference for both apps)

```
PENDING_PAYMENT → CONFIRMED → PHLEBOTOMIST_ASSIGNED → SAMPLE_COLLECTED → IN_LAB → REPORT_READY
                                                                                  ↘
                                                              CANCELLED (from any state, by customer or admin)
```

- `PENDING_PAYMENT → CONFIRMED`: automatic on successful Razorpay payment (or immediately for COD checkout).
- `CONFIRMED → PHLEBOTOMIST_ASSIGNED`: admin assigns a phlebotomist (admin web panel only, today).
- `PHLEBOTOMIST_ASSIGNED → SAMPLE_COLLECTED`: phlebotomist app.
- `SAMPLE_COLLECTED → IN_LAB`: phlebotomist app (handover).
- `IN_LAB → REPORT_READY`: admin uploads/approves the report.
- Every transition is logged in `OrderStatusLog` with who changed it — useful if you need a "what happened and when" screen.

---

## 6. Payments (Razorpay) — same pattern everywhere

1. App calls `POST .../razorpay/create-order` → gets a Razorpay order id + amount + key.
2. App opens Razorpay's mobile Checkout SDK with those values.
3. On success, app calls `POST .../razorpay/verify` with the payment id + signature Razorpay returned.
4. Server also has a webhook fallback, so a payment can still get confirmed server-side even if the app is closed/crashes right after paying — don't build extra client-side retry logic to compensate for this, it's already handled.

Same exact pattern is used for booking checkout and for wallet top-ups.

**Pay-at-Collection (COD)** bypasses Razorpay entirely — it's reconciled later via the phlebotomist's `/payment` endpoint when they physically collect cash/UPI.

---

## 7. Push notifications

Backend uses **Firebase Cloud Messaging**. Token registration endpoints (customer and phlebotomist) are already platform-agnostic — just register the FCM token your app obtains from the device. One thing to flag to the backend dev: the `DeviceToken.platform` enum currently only has a `WEB` value; it'll need `ANDROID`/`IOS` values added before native tokens can be distinguished (functionally the send logic doesn't care, but worth doing for correctness/analytics).

Notifications already fire automatically on: sample collected, handed over to lab (patient gets notified at each phlebotomist action) — no extra work needed to trigger these, just handle receiving them in the app.

---

## 8. Open questions to resolve with the backend dev before/while building

1. Is there a dedicated slot-availability endpoint the app can call directly, or does slot data only come back embedded in `/orders/quote`? (Not confirmed during this review — check before designing the slot-picker screen.)
2. Do you want booking reschedule in v1? (Not built — needs backend work.)
3. Do you want the customer app to show "phlebotomist reached your address" as a tracked status? (Needs a backend enum addition — currently a silent timestamp only.)
4. Is live phlebotomist location tracking in scope? (Not built at all today.)
5. Should phlebotomists be able to decline/request reassignment of a booking from the app? (Not built — admin-only today.)
