-- Partners accept their MOU online with an OTP to their registered mobile (no printing / uploading / admin verify).
-- AlterTable
ALTER TABLE "partner_commission_mous" ADD COLUMN     "acceptedIp" TEXT,
ADD COLUMN     "acceptedPhone" TEXT;

