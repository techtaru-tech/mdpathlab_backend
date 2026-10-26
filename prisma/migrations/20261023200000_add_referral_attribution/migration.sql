-- CreateEnum
CREATE TYPE "ReferralSource" AS ENUM ('LINK', 'QR', 'CODE_ENTRY', 'ADMIN');

-- CreateEnum
CREATE TYPE "ReferralBoundVia" AS ENUM ('SELF_CLAIM', 'ADMIN');

-- CreateEnum
CREATE TYPE "PatientReferralStatus" AS ENUM ('ACTIVE', 'DISPUTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ReferralActorType" AS ENUM ('PATIENT', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReferralAttemptOutcome" AS ENUM ('BOUND', 'ALREADY_REFERRED', 'EXISTING_CUSTOMER', 'SELF_REFERRAL', 'PARTNER_NOT_ACTIVE', 'INVALID_CODE');

-- CreateEnum
CREATE TYPE "SnapshotRecordedBy" AS ENUM ('SWEEPER', 'ADMIN_RETRY');

-- CreateTable
CREATE TABLE "referral_codes" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),
    "retiredReason" TEXT,
    "retiredBy" TEXT,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_referrals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "codeId" TEXT,
    "source" "ReferralSource" NOT NULL,
    "boundVia" "ReferralBoundVia" NOT NULL,
    "status" "PatientReferralStatus" NOT NULL DEFAULT 'ACTIVE',
    "policyVersion" TEXT NOT NULL,
    "boundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientCapturedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_referral_events" (
    "id" TEXT NOT NULL,
    "patientReferralId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "fromPartnerId" TEXT,
    "toPartnerId" TEXT,
    "fromStatus" "PatientReferralStatus",
    "toStatus" "PatientReferralStatus",
    "reason" TEXT,
    "actorType" "ReferralActorType" NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_referral_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "partnerId" TEXT,
    "codeAttempted" TEXT NOT NULL,
    "outcome" "ReferralAttemptOutcome" NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_referral_attributions" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "patientReferralId" TEXT NOT NULL,
    "referralStatusAtBooking" "PatientReferralStatus" NOT NULL,
    "partnerStatusAtBooking" "ReferralPartnerStatus" NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "orderCreatedAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" "SnapshotRecordedBy" NOT NULL,

    CONSTRAINT "order_referral_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_snapshot_failures" (
    "orderId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT NOT NULL,
    "needsAttention" BOOLEAN NOT NULL DEFAULT false,
    "firstFailedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_snapshot_failures_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "referral_job_heartbeats" (
    "id" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastProcessed" INTEGER NOT NULL DEFAULT 0,
    "lastBacklog" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_job_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- CreateIndex
CREATE INDEX "referral_codes_partnerId_idx" ON "referral_codes"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_referrals_userId_key" ON "patient_referrals"("userId");

-- CreateIndex
CREATE INDEX "patient_referrals_partnerId_boundAt_idx" ON "patient_referrals"("partnerId", "boundAt");

-- CreateIndex
CREATE INDEX "patient_referrals_status_idx" ON "patient_referrals"("status");

-- CreateIndex
CREATE INDEX "patient_referral_events_patientReferralId_createdAt_idx" ON "patient_referral_events"("patientReferralId", "createdAt");

-- CreateIndex
CREATE INDEX "patient_referral_events_userId_createdAt_idx" ON "patient_referral_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "referral_attempts_partnerId_createdAt_idx" ON "referral_attempts"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "referral_attempts_userId_createdAt_idx" ON "referral_attempts"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "referral_attempts_outcome_createdAt_idx" ON "referral_attempts"("outcome", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "order_referral_attributions_orderId_key" ON "order_referral_attributions"("orderId");

-- CreateIndex
CREATE INDEX "order_referral_attributions_partnerId_orderCreatedAt_idx" ON "order_referral_attributions"("partnerId", "orderCreatedAt");

-- CreateIndex
CREATE INDEX "order_referral_attributions_userId_idx" ON "order_referral_attributions"("userId");

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "referral_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_referrals" ADD CONSTRAINT "patient_referrals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_referrals" ADD CONSTRAINT "patient_referrals_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "referral_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_referrals" ADD CONSTRAINT "patient_referrals_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "referral_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_referral_events" ADD CONSTRAINT "patient_referral_events_patientReferralId_fkey" FOREIGN KEY ("patientReferralId") REFERENCES "patient_referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_referral_attributions" ADD CONSTRAINT "order_referral_attributions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_referral_attributions" ADD CONSTRAINT "order_referral_attributions_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "referral_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_referral_attributions" ADD CONSTRAINT "order_referral_attributions_patientReferralId_fkey" FOREIGN KEY ("patientReferralId") REFERENCES "patient_referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written (Prisma's schema language cannot express partial indexes).
-- ---------------------------------------------------------------------------------------------

-- At most one active (not retired) referral code per partner. Retired codes stay, and are never reissued.
CREATE UNIQUE INDEX "referral_codes_one_active_per_partner_key"
  ON "referral_codes" ("partnerId")
  WHERE "retiredAt" IS NULL;
