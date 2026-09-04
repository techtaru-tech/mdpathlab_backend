-- CreateEnum
CREATE TYPE "CollectionPaymentMode" AS ENUM ('CASH', 'UPI');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "collectedAmount" INTEGER,
ADD COLUMN     "collectedAt" TIMESTAMP(3),
ADD COLUMN     "collectionPaymentMode" "CollectionPaymentMode";
