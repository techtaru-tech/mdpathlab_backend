-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "emailNotifications" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "toEmail" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "error" TEXT,
    "messageId" TEXT,
    "orderId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_logs_status_createdAt_idx" ON "email_logs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "email_logs_userId_createdAt_idx" ON "email_logs"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
