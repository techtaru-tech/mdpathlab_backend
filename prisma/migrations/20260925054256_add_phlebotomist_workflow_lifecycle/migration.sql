-- CreateEnum
CREATE TYPE "PhlebotomistAssignmentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "assignmentRejectedReason" TEXT,
ADD COLUMN     "assignmentStatus" "PhlebotomistAssignmentStatus",
ADD COLUMN     "collectionOtp" TEXT,
ADD COLUMN     "collectionOtpVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "onTheWayAt" TIMESTAMP(3),
ADD COLUMN     "sampleReceivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "order_samples" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "tubeType" TEXT,
    "quantity" TEXT,
    "label" TEXT,
    "collectedAt" TIMESTAMP(3),

    CONSTRAINT "order_samples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_samples_orderItemId_key" ON "order_samples"("orderItemId");

-- AddForeignKey
ALTER TABLE "order_samples" ADD CONSTRAINT "order_samples_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
