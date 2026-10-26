-- Partner earnings & payouts (built switched OFF). Additive only: new enums, tables, indexes and foreign keys;
-- no existing table or row is changed. One settings row is created with commission disabled.

-- CreateEnum
CREATE TYPE "CommissionEntryType" AS ENUM ('EARNING', 'REVERSAL', 'WITHDRAWAL', 'WITHDRAWAL_RETURNED', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "commission_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "activeSince" TIMESTAMP(3),
    "ratePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "holdDays" INTEGER NOT NULL DEFAULT 7,
    "minWithdrawalRupees" INTEGER NOT NULL DEFAULT 5000,
    "tdsPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_entries" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "type" "CommissionEntryType" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "orderId" TEXT,
    "withdrawalId" TEXT,
    "baseRupees" INTEGER,
    "ratePercent" DECIMAL(5,2),
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "tdsPaise" INTEGER NOT NULL DEFAULT 0,
    "netPaise" INTEGER NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "accountHolderName" TEXT NOT NULL,
    "accountNumberEnc" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "utr" TEXT,
    "adminNote" TEXT,
    "decidedByAdminId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_bank_accounts" (
    "partnerId" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountNumberEnc" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_bank_accounts_pkey" PRIMARY KEY ("partnerId")
);

-- CreateIndex
CREATE INDEX "commission_entries_partnerId_createdAt_idx" ON "commission_entries"("partnerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "commission_entries_orderId_type_key" ON "commission_entries"("orderId", "type");

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_createdAt_idx" ON "withdrawal_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "withdrawal_requests_partnerId_createdAt_idx" ON "withdrawal_requests"("partnerId", "createdAt");

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "referral_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "withdrawal_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "referral_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_bank_accounts" ADD CONSTRAINT "partner_bank_accounts_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "referral_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one withdrawal in progress per partner (a double-click or two tabs can never create two).
CREATE UNIQUE INDEX "withdrawal_requests_one_open_per_partner" ON "withdrawal_requests"("partnerId") WHERE "status" IN ('REQUESTED', 'APPROVED');

-- Each ledger row has the sign its type implies, whatever the application does.
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_sign_check" CHECK (
  ("type" IN ('EARNING', 'WITHDRAWAL_RETURNED') AND "amountPaise" > 0) OR
  ("type" IN ('REVERSAL', 'WITHDRAWAL') AND "amountPaise" < 0) OR
  ("type" = 'ADJUSTMENT' AND "amountPaise" <> 0)
);
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_amounts_check" CHECK ("amountPaise" > 0 AND "tdsPaise" >= 0 AND "netPaise" = "amountPaise" - "tdsPaise");

-- The single settings row, commission OFF.
INSERT INTO "commission_settings" ("id", "enabled", "updatedAt") VALUES ('default', false, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
