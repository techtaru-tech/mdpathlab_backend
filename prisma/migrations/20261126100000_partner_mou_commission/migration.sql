-- Partner MOU commission: per-partner Routine / Special / Package rates with effective dates, test categories,
-- proportional reversal on partial refunds.
-- CreateEnum
CREATE TYPE "CommissionCategory" AS ENUM ('ROUTINE', 'SPECIAL', 'PACKAGE');

-- DropIndex
DROP INDEX "commission_entries_orderId_type_key";

-- AlterTable
ALTER TABLE "commission_entries" ADD COLUMN     "seq" INTEGER NOT NULL DEFAULT 0;

-- Existing reversals were full reversals: their step is the whole earning.
UPDATE "commission_entries" SET "seq" = -"amountPaise" WHERE "type" = 'REVERSAL';

-- AlterTable
ALTER TABLE "order_item_commission_rates" ADD COLUMN     "category" "CommissionCategory",
ADD COLUMN     "mouId" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "refundedPaise" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "commission_item_categories" (
    "itemType" "CartItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "category" "CommissionCategory" NOT NULL,
    "updatedByAdminId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_item_categories_pkey" PRIMARY KEY ("itemType","itemId")
);

-- CreateTable
CREATE TABLE "partner_commission_mous" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "routinePercent" DECIMAL(5,2) NOT NULL,
    "specialPercent" DECIMAL(5,2) NOT NULL,
    "packagePercent" DECIMAL(5,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "documentUrl" TEXT,
    "documentMimeType" TEXT,
    "note" TEXT,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnByAdminId" TEXT,

    CONSTRAINT "partner_commission_mous_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_commission_mous_partnerId_effectiveFrom_idx" ON "partner_commission_mous"("partnerId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "commission_entries_orderId_type_seq_key" ON "commission_entries"("orderId", "type", "seq");

-- AddForeignKey
ALTER TABLE "partner_commission_mous" ADD CONSTRAINT "partner_commission_mous_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "referral_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

