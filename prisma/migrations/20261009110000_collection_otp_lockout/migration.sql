ALTER TABLE "orders" ADD COLUMN "collectionOtpAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "collectionOtpLockedUntil" TIMESTAMP(3);
