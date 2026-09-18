-- AlterTable
ALTER TABLE "wallet_transactions" ADD COLUMN "razorpayOrderId" TEXT,
ADD COLUMN "razorpayPaymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_razorpayOrderId_key" ON "wallet_transactions"("razorpayOrderId");
