# Phlebotomist App — Development Spec

**For:** the app developer building the standalone Phlebotomist mobile app.
**Source of truth:** this document describes the *existing, live* backend (NestJS + Prisma +
PostgreSQL) at `mdpathlab.techtaru.in`. Every endpoint below is already built and in production —
this app is the **first real client** for most of it. A reference web implementation already
exists (`phlebotomist.login.tsx`, `phlebotomist.index.tsx`, `phlebotomist.orders.$id.tsx` in the
web app's `src/routes/`) — use it as the functional model for every screen.

Production API base: `https://mdpathlab.techtaru.in/api`. Local dev: `http://localhost:3001` (no
`/api` prefix locally — that's added only by production's reverse proxy).

---

## 1. Who a phlebotomist is

A phlebotomist is a `User` row (same table as customers) with `role: PHLEBOTOMIST`, linked to one
`Phlebotomist` record: `employeeCode` (unique), `vehicleType`, `vehicleNumber`, `coverageCity`,
`status` (`ACTIVE` / `INACTIVE` / `ON_LEAVE`), `rating`, `totalCollections`, and optionally
`labId` — which partner Lab they belong to (null for MD Path Lab's own centrally-run
phlebotomists). A lab's own phlebotomists are only ever assignable to that same lab's bookings.

**There is no self-registration.** A phlebotomist account (User + Phlebotomist row) is created by
admin or by the owning lab beforehand. OTP login only succeeds against a phone number that's
already provisioned this way — there's no "sign up" screen to build.

**Assignment is not something the phlebotomist app initiates.** Admin or the lab's own dashboard
picks which phlebotomist gets which booking (a scheduling/conflict-checking engine runs
server-side to warn about double-booking, travel time, etc. — see §5). The app's job starts once
an assignment already exists: **accept or reject it**, then work it through to handover.

---

## 2. Screens & flow (mirror the existing web app)

| Screen | Reference web route | Notes |
|---|---|---|
| OTP Login | `/phlebotomist/login` | Phone + OTP only, no password. |
| Today's Assignments (dashboard) | `/phlebotomist/` | List of today's HOME-collection bookings, sorted by slot. Each card shows patient name, order number, address, slot, and a sub-status pill (see §4.1). |
| Assignment / Booking Detail | `/phlebotomist/orders/:id` | The step-by-step action screen — see §2.1. |
| Collection History | *(API only today — no dedicated web page yet)* | Date-grouped list of completed collections with cash/UPI totals. Build a real screen for this in the app. |
| Profile / change phone | *(API only today)* | `GET /auth/phlebotomist/me`, change-phone request/verify. |

### 2.1 Booking Detail — the linear action sequence

This is the one screen most of the app's work is. Buttons appear/disappear based on the
booking's current state (mirror this exactly — don't show a button whose precondition isn't met,
since the API will just reject it with a 400):

1. **Accept / Reject** — shown only while `assignmentStatus === "PENDING"`. Reject takes an
   optional free-text reason and immediately unassigns the phlebotomist (booking goes back to the
   lab/admin's unassigned pool) — nothing further in this list applies after a reject.
2. **On the way** — shown once `assignmentStatus === "ACCEPTED"` and `onTheWayAt` is not yet set.
3. **Reached** — shown once `onTheWayAt` is set (or immediately after accept, if you skip "on the
   way") and `reachedAt` is not yet set. This generates a 4-digit code and pushes it to the
   **patient** (never returned in this API's own response — see §5).
4. **Verify code** — shown once `reachedAt` is set and `collectionOtpVerifiedAt` is not. The
   phlebotomist asks the patient to read back the code they were just sent and enters it here.
5. **Samples** — once verified, list every line item (`GET .../samples`) and let the phlebotomist
   record tube type / quantity / a physical label per item, and tick each one "collected"
   (`PATCH .../samples/:orderItemId`). This can happen over several calls as items are drawn one
   at a time.
6. **Sample Collected** — shown once every item on the order has `sample.collectedAt` set. Marks
   the whole order `SAMPLE_COLLECTED` and notifies the patient.
7. **Collect Payment** — shown only if `paymentMethod === "COD"` and the order hasn't been paid
   yet. Amount (positive integer, whole rupees) + mode (`CASH` / `UPI`). One-time — can't be
   re-recorded once set.
8. **Handover to Lab** — shown once the order is `SAMPLE_COLLECTED`. Scan or type the sample
   barcode. This does **not** flip the order to `IN_LAB` itself — the lab separately acknowledges
   physical receipt on their own dashboard, which is what actually drives `IN_LAB`. `handedOverAt`
   is just the phlebotomist's own "I dropped it off" record, and is also what powers Collection
   History (see below) — it's set the same way regardless of payment method.

### 2.2 Sub-status labels (for the dashboard card / detail header)

The API exposes `phlebotomistStatus` (`"Pending" | "Collected" | "Handed Over" | "Cancelled"`) —
a coarse mapping of the underlying `OrderStatus`. For a finer-grained label (what the reference
web app actually shows on the dashboard card), derive it client-side from the timestamp/status
fields, in this priority order:

```
assignmentStatus === "PENDING"        → "Awaiting your response"
handedOverAt is set                   → "Handed over to lab"
phlebotomistStatus === "Collected"    → "Sample collected"
collectionOtpVerifiedAt is set        → "Verified — ready to collect"
reachedAt is set                      → "Arrived"
onTheWayAt is set                     → "On the way"
otherwise                             → "Accepted — not started"
```

---

## 3. Auth

| Method & Path | Auth | Purpose |
|---|---|---|
| POST `/auth/phlebotomist/otp/request` | Public | Send OTP to phone. Rate-limited 5/min. `{ phone }` → `{ message, expiresInSeconds }` (plus a `devCode` field in non-production environments only — never rely on it, it won't be there in prod). |
| POST `/auth/phlebotomist/otp/verify` | Public | `{ phone, code }` → `{ accessToken, phlebotomist: { id, userId, phone, name, employeeCode, status } }`. Rate-limited 10/min. Fails with 403 if the phone isn't a provisioned, ACTIVE phlebotomist. |
| GET `/auth/phlebotomist/me` | ✅ | `{ phlebotomist: {...full row incl. lab...} }` |
| POST `/auth/phlebotomist/change-phone/request` | ✅ | `{ newPhone }` — sends OTP to the new number. |
| POST `/auth/phlebotomist/change-phone/verify` | ✅ | `{ newPhone, code }` — confirms the change. |

✅ = send `Authorization: Bearer <accessToken>`. This is a **separate JWT realm** from the
customer/admin tokens — a phlebotomist token carries `type: 'phlebotomist'` and is rejected by
every other guard, and vice versa.

---

## 4. API reference (`/phlebotomist`, all require the phlebotomist's own JWT)

| Method & Path | Purpose | Preconditions (else 400) |
|---|---|---|
| GET `/phlebotomist/assignments/today` | Today's (IST calendar day) HOME-collection bookings assigned to this phlebotomist, sorted by slot start time | — |
| GET `/phlebotomist/orders/:id` | Full booking detail (patient name+phone, address, slot, collection centre, line items incl. family member) | 404 if not assigned to this phlebotomist — doesn't leak existence |
| POST `/phlebotomist/orders/:id/accept` | Accept the assignment, notifies the patient | `assignmentStatus` must be `PENDING` |
| POST `/phlebotomist/orders/:id/reject` | `{ reason? }` — decline; unassigns the phlebotomist entirely and reopens the booking for reassignment | `assignmentStatus` must be `PENDING` |
| POST `/phlebotomist/orders/:id/on-the-way` | Marks departure, notifies the patient | `assignmentStatus` must be `ACCEPTED`; not already on the way |
| POST `/phlebotomist/orders/:id/reached` | Marks arrival, generates a 4-digit code and **pushes it to the patient** (not returned here) | Booking is HOME, not cancelled, not already reached |
| POST `/phlebotomist/orders/:id/verify-otp` | `{ code }` (4 digits) — verifies the code the patient reads back | A code must already exist (i.e. reached was called); not already verified |
| GET `/phlebotomist/orders/:id/samples` | One row per line item: `{ orderItemId, itemName, sample: { tubeType, quantity, label, collectedAt } | null }` — auto-creates the sample row on first read | — |
| PATCH `/phlebotomist/orders/:id/samples/:orderItemId` | `{ tubeType?, quantity?, label?, collected? }` — any subset; `collected: true` stamps `collectedAt` now | — |
| POST `/phlebotomist/orders/:id/sample-collected` | Moves the order to `SAMPLE_COLLECTED`, notifies the patient | Must be reached + code verified; **every** item's sample must have `collectedAt` set |
| POST `/phlebotomist/orders/:id/payment` | `{ amount, paymentMode: "CASH" \| "UPI" }` — records COD collection | Order must be COD, status `SAMPLE_COLLECTED`, and not already recorded |
| POST `/phlebotomist/orders/:id/handover` | `{ sampleBarcode }` — hands the sample to the lab | Status must be `SAMPLE_COLLECTED`; not already handed over |
| GET `/phlebotomist/collections/history` | Date-grouped completed collections (`handedOverAt` set, order not cancelled) with per-day and overall cash/UPI totals | — |

**Push notifications / device token**
| Method & Path | Purpose |
|---|---|
| POST `/phlebotomist/notifications/device-token` | `{ token, platform? }` — register for push. **`platform` currently only accepts `"WEB"`** — ask the backend team to extend this enum (e.g. `"ANDROID"` / `"IOS"`) before shipping; it's a straightforward one-line validator change, just not done yet since nothing has needed it. |
| DELETE `/phlebotomist/notifications/device-token` | `{ token }` — unregister (e.g. on logout). |

Every action above that notifies the **patient** does so via Firebase push with a `data.type`
payload the customer app reads — the phlebotomist app itself doesn't need to send any of these,
just trigger them by calling the endpoint. What the phlebotomist app *does* need to handle
receiving is:

| `data.type` | When | Meaning for this app |
|---|---|---|
| `ASSIGNMENT` | Admin/lab assigns this phlebotomist to a new booking | Refresh Today's Assignments; consider a local notification since this can happen any time, not just at login |

(All the other push types — `ORDER_STATUS` with various `status` values, etc. — are the
**customer** app's notifications, not this one's; they're listed here only because they come from
the same `NotificationsService` and appear in its logs.)

---

## 5. Things that will trip you up if you don't know them

- **`reachedAt`/the doorstep code exist and are real, current behavior.** There's a stale code
  comment in this backend (`phlebotomist-status.ts`) that says "reached" has no backing field —
  that comment predates the current API and is simply wrong; `POST .../reached` and the whole
  code-verification step are live and required. Trust the endpoint table above, not that comment,
  if you ever read the source.
- **The 4-digit doorstep code is never sent to the phlebotomist's own device.** It's pushed only
  to the *patient*. The phlebotomist reads it back from the patient in person and submits it via
  `verify-otp`. Don't build a screen that expects the `reached` response to contain the code — it
  won't.
- **HOME-collection only.** Every endpoint above 404s or 400s on anything that isn't a
  HOME-collection booking (`collectionType !== 'HOME'`). A phlebotomist is never involved in a
  CENTER-visit booking (walk-in to a collection centre) or a radiology booking (the customer
  visits a partner lab directly for X-Ray/CT/MRI/etc. — see `APP_DEVELOPMENT_SPEC.md` if that
  matters to you).
- **No status-transition matrix beyond what's listed.** Each endpoint checks its own specific
  precondition (shown in the table above) but there's no broader "can only go from X to Y" rule
  engine — match the UI to those specific preconditions, not to a general state machine you invent.
- **Assignment/scheduling conflict-checking is entirely server-side and not an app concern.**
  When admin or a lab assigns a phlebotomist, a background engine checks whether the new booking's
  slot window can realistically be fit alongside that phlebotomist's other bookings that day
  (travel time between addresses, a configurable safety buffer, etc.), and can flag an assignment
  as "needs manual review" if an address has no reliable map coordinates. None of this is an API
  the app calls — it only matters as background context for *why* a phlebotomist might see a
  booking suddenly appear or disappear from Today's Assignments.
- **Rejecting an assignment is final for that phlebotomist.** It doesn't go back to "pending" for
  them to reconsider — it fully unassigns and the booking becomes available for reassignment to
  someone else (or the same phlebotomist again, if re-assigned).
- **Collection History's "completed" definition is `handedOverAt`, not `collectedAt`.**
  `collectedAt` (payment timestamp) is only ever set for COD bookings, so using it as the
  completion filter would silently drop every ONLINE-paid booking from history. If you build your
  own client-side aggregation instead of using the `/collections/history` endpoint's totals,
  filter on `handedOverAt`, matching the backend.
