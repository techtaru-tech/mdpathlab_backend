-- CreateEnum
CREATE TYPE "NotificationApp" AS ENUM ('CUSTOMER', 'PHLEBOTOMIST');

-- AlterTable
ALTER TABLE "device_tokens" ADD COLUMN     "app" "NotificationApp" NOT NULL DEFAULT 'CUSTOMER',
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "app" "NotificationApp" NOT NULL DEFAULT 'CUSTOMER';

-- CreateIndex
CREATE INDEX "device_tokens_userId_app_idx" ON "device_tokens"("userId", "app");

-- CreateIndex
CREATE INDEX "notifications_userId_app_createdAt_idx" ON "notifications"("userId", "app", "createdAt");


-- Existing rows: tokens and notifications of phlebotomist accounts belong to the phlebotomist app (browser tokens
-- are always the customer website).
UPDATE "device_tokens" SET "app" = 'PHLEBOTOMIST'
WHERE "platform" <> 'WEB' AND "userId" IN (SELECT "userId" FROM "phlebotomists");
UPDATE "notifications" SET "app" = 'PHLEBOTOMIST'
WHERE "userId" IN (SELECT "userId" FROM "phlebotomists");
