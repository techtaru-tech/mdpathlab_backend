-- A partner (doctor / clinic / collection centre) books for a patient from the partner portal, with the patient's OTP.
-- AlterEnum
ALTER TYPE "SnapshotRecordedBy" ADD VALUE 'PARTNER_BOOKING';

-- AlterTable
ALTER TABLE "order_referral_attributions" ADD COLUMN     "bookedByPartner" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "patientReferralId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "order_referral_attributions_partnerId_bookedByPartner_idx" ON "order_referral_attributions"("partnerId", "bookedByPartner");

