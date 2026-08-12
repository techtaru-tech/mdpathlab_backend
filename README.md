# MD Path Labs — API

Node.js backend for MD Path Labs' Patient Web and Admin Panel (Phase 1 of the development plan —
mobile apps and their dedicated field-facing API surface come later, in Phase 2).

Stack: NestJS (TypeScript) + PostgreSQL via Prisma + Redis. A prior sibling project (SmartLab, PHP/Laravel)
was read for its *flow* only — catalogue shape, order lifecycle, notification patterns — not its tech or
its rough edges; this build is Node throughout and deliberately doesn't repeat its known anti-patterns
(unhashed/no-expiry OTPs, duplicate schemas for the same role, etc.).

## Local setup

```bash
npm install
docker compose up -d        # Postgres on :5433, Redis on :6380 (5432/6379 were already taken locally)
npx prisma migrate dev      # applies prisma/migrations/
npm run db:seed             # interim catalogue seed — mirrors the frontend's mock data until the
                             # client's real Test/Package Master CSV lands
npm run start:dev           # http://localhost:3001
```

Copy `.env.example` to `.env` first and adjust as needed.

## What's here (M0 — Foundation)

- **Auth** (`src/auth`) — phone + OTP login for patients (and, later, phlebotomists — same table,
  gated by role). OTP is hashed (bcrypt), time-limited, attempt-limited, and resend-cooldown-limited via
  Redis. `OTP_DEV_ECHO=true` echoes the code back in the API response for local testing only; never
  enable this in production regardless of the flag, since the code also checks `NODE_ENV`.
- **Catalogue** (`src/catalogue`) — parameters (atomic tests) → profiles (named test bundles) →
  packages (health packages), with a real join table for package contents — not SmartLab's
  comma-separated ID strings.
- **Schema** (`prisma/schema.prisma`) — also includes phlebotomists, collection centers, orders,
  coupons and reports, since Admin needs to manage/assign field staff regardless of whether their app
  exists yet. The phlebotomist-facing API endpoints themselves are Phase 2.

## Not yet built

Cart/checkout/payment (Razorpay), Admin panel endpoints, report upload/approval, WhatsApp/SMS sending
(gateway credentials still pending from the client), and everything phlebotomist-app-facing. See the
development plan for the full milestone breakdown.
