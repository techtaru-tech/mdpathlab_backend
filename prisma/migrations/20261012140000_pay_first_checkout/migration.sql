-- CreateEnum
CREATE TYPE "CheckoutSessionStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED', 'FAILED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- CreateTable
CREATE TABLE "checkout_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CheckoutSessionStatus" NOT NULL DEFAULT 'PENDING',
    "snapshot" JSONB NOT NULL,
    "amount" INTEGER NOT NULL,
    "walletHold" INTEGER NOT NULL DEFAULT 0,
    "slotId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "collectionType" "CollectionType" NOT NULL,
    "collectionCenterId" TEXT,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "razorpayRefundId" TEXT,
    "refundStatus" TEXT,
    "orderId" TEXT,
    "failureReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "razorpay_webhook_events" (
    "eventId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "razorpay_webhook_events_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "payment_audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "checkoutSessionId" TEXT,
    "orderId" TEXT,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "event" TEXT NOT NULL,
    "amount" INTEGER,
    "result" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkout_sessions_razorpayOrderId_key" ON "checkout_sessions"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_sessions_razorpayPaymentId_key" ON "checkout_sessions"("razorpayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_sessions_orderId_key" ON "checkout_sessions"("orderId");

-- CreateIndex
CREATE INDEX "checkout_sessions_userId_status_idx" ON "checkout_sessions"("userId", "status");

-- CreateIndex
CREATE INDEX "checkout_sessions_status_expiresAt_idx" ON "checkout_sessions"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "checkout_sessions_slotId_scheduledDate_status_idx" ON "checkout_sessions"("slotId", "scheduledDate", "status");

-- CreateIndex
CREATE INDEX "payment_audit_logs_checkoutSessionId_idx" ON "payment_audit_logs"("checkoutSessionId");

-- CreateIndex
CREATE INDEX "payment_audit_logs_razorpayPaymentId_idx" ON "payment_audit_logs"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "payment_audit_logs_createdAt_idx" ON "payment_audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

