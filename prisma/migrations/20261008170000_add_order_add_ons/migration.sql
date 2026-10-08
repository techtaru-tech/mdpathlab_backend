-- CreateEnum
CREATE TYPE "OrderAddOnStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "addOnTotal" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "addOnId" TEXT;

-- CreateTable
CREATE TABLE "order_add_ons" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "phlebotomistId" TEXT NOT NULL,
    "status" "OrderAddOnStatus" NOT NULL DEFAULT 'PENDING',
    "items" JSONB NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_add_ons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_add_ons_orderId_status_idx" ON "order_add_ons"("orderId", "status");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "order_add_ons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_add_ons" ADD CONSTRAINT "order_add_ons_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
