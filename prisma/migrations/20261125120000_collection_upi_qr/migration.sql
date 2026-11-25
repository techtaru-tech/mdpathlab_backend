-- Razorpay UPI QR shown by the phlebotomist at the door
CREATE TYPE "CollectionQrStatus" AS ENUM ('ACTIVE', 'PAID', 'PAID_LATE', 'CLOSED');

CREATE TABLE "collection_upi_qrs" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "phlebotomistId" TEXT NOT NULL,
    "razorpayQrId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "CollectionQrStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "razorpayPaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collection_upi_qrs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "collection_upi_qrs_razorpayQrId_key" ON "collection_upi_qrs"("razorpayQrId");
CREATE UNIQUE INDEX "collection_upi_qrs_razorpayPaymentId_key" ON "collection_upi_qrs"("razorpayPaymentId");
CREATE INDEX "collection_upi_qrs_orderId_status_idx" ON "collection_upi_qrs"("orderId", "status");

ALTER TABLE "collection_upi_qrs" ADD CONSTRAINT "collection_upi_qrs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
