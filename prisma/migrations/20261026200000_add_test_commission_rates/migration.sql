-- Per-test commission rates (Admin → Payouts → Test-wise rates) and the rate each booked line had at booking time.
-- Additive only: two new tables and one nullable column on commission_entries; no existing row changes.

-- AlterTable
ALTER TABLE "commission_entries" ADD COLUMN     "breakdown" JSONB;

-- CreateTable
CREATE TABLE "commission_rates" (
    "itemType" "CartItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "ratePercent" DECIMAL(5,2) NOT NULL,
    "updatedByAdminId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_rates_pkey" PRIMARY KEY ("itemType","itemId")
);

-- CreateTable
CREATE TABLE "order_item_commission_rates" (
    "orderItemId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "ratePercent" DECIMAL(5,2) NOT NULL,
    "source" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_commission_rates_pkey" PRIMARY KEY ("orderItemId")
);

-- CreateIndex
CREATE INDEX "order_item_commission_rates_orderId_idx" ON "order_item_commission_rates"("orderId");

-- AddForeignKey
ALTER TABLE "order_item_commission_rates" ADD CONSTRAINT "order_item_commission_rates_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rates stay within what the settings screen allows.
ALTER TABLE "commission_rates" ADD CONSTRAINT "commission_rates_range_check" CHECK ("ratePercent" >= 0 AND "ratePercent" <= 50);
ALTER TABLE "order_item_commission_rates" ADD CONSTRAINT "order_item_commission_rates_range_check" CHECK ("ratePercent" >= 0 AND "ratePercent" <= 50);
