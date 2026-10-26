-- CreateEnum
CREATE TYPE "ReferralPartnerType" AS ENUM ('DOCTOR', 'CLINIC');

-- CreateEnum
CREATE TYPE "ReferralPartnerStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PartnerActorType" AS ENUM ('PARTNER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PartnerDocumentKind" AS ENUM ('MEDICAL_REGISTRATION_CERTIFICATE', 'QUALIFICATION_CERTIFICATE', 'IDENTITY_PROOF', 'PHOTO', 'ESTABLISHMENT_REGISTRATION_CERTIFICATE', 'OWNER_MEDICAL_REGISTRATION_CERTIFICATE', 'ADDRESS_PROOF', 'AUTHORIZATION_LETTER', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentRequirementLevel" AS ENUM ('MANDATORY', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "AffiliationStatus" AS ENUM ('REQUESTED', 'ACTIVE', 'REJECTED', 'ENDED');

-- CreateTable
CREATE TABLE "referral_partners" (
    "id" TEXT NOT NULL,
    "type" "ReferralPartnerType" NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneVerifiedAt" TIMESTAMP(3) NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "status" "ReferralPartnerStatus" NOT NULL DEFAULT 'DRAFT',
    "declarationAcceptedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submittedRequirements" JSONB,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_profiles" (
    "partnerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "medicalCouncil" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "registrationYear" INTEGER,
    "qualification" TEXT NOT NULL,
    "specialization" TEXT,
    "city" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,

    CONSTRAINT "doctor_profiles_pkey" PRIMARY KEY ("partnerId")
);

-- CreateTable
CREATE TABLE "clinic_types" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "registrationNumberRequired" BOOLEAN NOT NULL DEFAULT false,
    "registrationNumberLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_types_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "clinic_profiles" (
    "partnerId" TEXT NOT NULL,
    "clinicName" TEXT NOT NULL,
    "clinicTypeCode" TEXT NOT NULL,
    "registrationAuthority" TEXT,
    "registrationNumber" TEXT,
    "gstin" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "pincode" TEXT NOT NULL,
    "contactPersonName" TEXT NOT NULL,
    "contactPersonDesignation" TEXT,

    CONSTRAINT "clinic_profiles_pkey" PRIMARY KEY ("partnerId")
);

-- CreateTable
CREATE TABLE "partner_document_requirements" (
    "id" TEXT NOT NULL,
    "partnerType" "ReferralPartnerType" NOT NULL,
    "clinicTypeCode" TEXT,
    "documentKind" "PartnerDocumentKind" NOT NULL,
    "level" "DocumentRequirementLevel" NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_document_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_partner_documents" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "kind" "PartnerDocumentKind" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "referral_partner_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_partner_events" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "fromStatus" "ReferralPartnerStatus",
    "toStatus" "ReferralPartnerStatus",
    "affiliationId" TEXT,
    "reason" TEXT,
    "actorType" "PartnerActorType" NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_partner_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_clinic_affiliations" (
    "id" TEXT NOT NULL,
    "doctorPartnerId" TEXT NOT NULL,
    "clinicPartnerId" TEXT NOT NULL,
    "status" "AffiliationStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "decidedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_clinic_affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_permission_profiles" (
    "adminId" TEXT NOT NULL,
    "restricted" BOOLEAN NOT NULL DEFAULT true,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_permission_profiles_pkey" PRIMARY KEY ("adminId")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referral_partners_type_status_createdAt_idx" ON "referral_partners"("type", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "referral_partners_type_phone_key" ON "referral_partners"("type", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_profiles_medicalCouncil_registrationNumber_key" ON "doctor_profiles"("medicalCouncil", "registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_profiles_registrationAuthority_registrationNumber_key" ON "clinic_profiles"("registrationAuthority", "registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "partner_document_requirements_partnerType_clinicTypeCode_do_key" ON "partner_document_requirements"("partnerType", "clinicTypeCode", "documentKind");

-- CreateIndex
CREATE INDEX "referral_partner_documents_partnerId_idx" ON "referral_partner_documents"("partnerId");

-- CreateIndex
CREATE INDEX "referral_partner_events_partnerId_createdAt_idx" ON "referral_partner_events"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "doctor_clinic_affiliations_doctorPartnerId_status_idx" ON "doctor_clinic_affiliations"("doctorPartnerId", "status");

-- CreateIndex
CREATE INDEX "doctor_clinic_affiliations_clinicPartnerId_status_idx" ON "doctor_clinic_affiliations"("clinicPartnerId", "status");

-- CreateIndex
CREATE INDEX "admin_audit_logs_entityType_entityId_createdAt_idx" ON "admin_audit_logs"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_adminId_createdAt_idx" ON "admin_audit_logs"("adminId", "createdAt");

-- AddForeignKey
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "referral_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_profiles" ADD CONSTRAINT "clinic_profiles_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "referral_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_profiles" ADD CONSTRAINT "clinic_profiles_clinicTypeCode_fkey" FOREIGN KEY ("clinicTypeCode") REFERENCES "clinic_types"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_document_requirements" ADD CONSTRAINT "partner_document_requirements_clinicTypeCode_fkey" FOREIGN KEY ("clinicTypeCode") REFERENCES "clinic_types"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_partner_documents" ADD CONSTRAINT "referral_partner_documents_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "referral_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_partner_events" ADD CONSTRAINT "referral_partner_events_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "referral_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_clinic_affiliations" ADD CONSTRAINT "doctor_clinic_affiliations_doctorPartnerId_fkey" FOREIGN KEY ("doctorPartnerId") REFERENCES "doctor_profiles"("partnerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_clinic_affiliations" ADD CONSTRAINT "doctor_clinic_affiliations_clinicPartnerId_fkey" FOREIGN KEY ("clinicPartnerId") REFERENCES "clinic_profiles"("partnerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_permission_profiles" ADD CONSTRAINT "admin_permission_profiles_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written (Prisma's schema language cannot express partial indexes or seed rows).
-- Everything below touches only the tables created above.
-- ---------------------------------------------------------------------------------------------

-- Doctors have no clinic type; NULL is distinct in a unique index, so the null case needs its own (cart_items convention).
CREATE UNIQUE INDEX "partner_document_requirements_no_clinic_type_key"
  ON "partner_document_requirements" ("partnerType", "documentKind")
  WHERE "clinicTypeCode" IS NULL;

-- At most one open affiliation per doctor–clinic pair.
CREATE UNIQUE INDEX "doctor_clinic_affiliations_open_pair_key"
  ON "doctor_clinic_affiliations" ("doctorPartnerId", "clinicPartnerId")
  WHERE "status" IN ('REQUESTED', 'ACTIVE');

-- Default clinic types and document requirements (admin-editable afterwards; pending business/legal confirmation).
INSERT INTO "clinic_types" ("code", "label", "registrationNumberRequired", "registrationNumberLabel", "sortOrder", "updatedAt") VALUES
  ('SOLO_CLINIC',       'Clinic (single doctor)',                false, 'Establishment registration no. (if registered)', 10, CURRENT_TIMESTAMP),
  ('POLYCLINIC',        'Polyclinic / multi-speciality clinic',  true,  'Establishment registration no.',                 20, CURRENT_TIMESTAMP),
  ('NURSING_HOME',      'Nursing home',                          true,  'Establishment registration no.',                 30, CURRENT_TIMESTAMP),
  ('HOSPITAL',          'Hospital',                              true,  'Establishment registration no.',                 40, CURRENT_TIMESTAMP),
  ('DIAGNOSTIC_CENTRE', 'Diagnostic / sample collection centre', true,  'Establishment registration no.',                 50, CURRENT_TIMESTAMP);

INSERT INTO "partner_document_requirements" ("id", "partnerType", "clinicTypeCode", "documentKind", "level", "updatedBy", "updatedAt")
SELECT 'pdr_' || lower(coalesce(v.clinic, 'doctor')) || '_' || lower(v.kind),
       v.ptype::"ReferralPartnerType", v.clinic, v.kind::"PartnerDocumentKind", v.lvl::"DocumentRequirementLevel",
       'migration', CURRENT_TIMESTAMP
FROM (VALUES
  ('DOCTOR', NULL::text,    'MEDICAL_REGISTRATION_CERTIFICATE',       'MANDATORY'),
  ('DOCTOR', NULL::text,    'IDENTITY_PROOF',                         'MANDATORY'),
  ('DOCTOR', NULL::text,    'QUALIFICATION_CERTIFICATE',              'OPTIONAL'),
  ('DOCTOR', NULL::text,    'PHOTO',                                  'OPTIONAL'),
  ('DOCTOR', NULL::text,    'OTHER',                                  'OPTIONAL'),
  ('CLINIC', 'SOLO_CLINIC', 'OWNER_MEDICAL_REGISTRATION_CERTIFICATE', 'MANDATORY'),
  ('CLINIC', 'SOLO_CLINIC', 'IDENTITY_PROOF',                         'MANDATORY'),
  ('CLINIC', 'SOLO_CLINIC', 'ADDRESS_PROOF',                          'MANDATORY'),
  ('CLINIC', 'SOLO_CLINIC', 'ESTABLISHMENT_REGISTRATION_CERTIFICATE', 'OPTIONAL'),
  ('CLINIC', 'SOLO_CLINIC', 'OTHER',                                  'OPTIONAL')
) AS v(ptype, clinic, kind, lvl)
UNION ALL
SELECT 'pdr_' || lower(t.clinic) || '_' || lower(k.kind),
       'CLINIC'::"ReferralPartnerType", t.clinic, k.kind::"PartnerDocumentKind", k.lvl::"DocumentRequirementLevel",
       'migration', CURRENT_TIMESTAMP
FROM (VALUES ('POLYCLINIC'), ('NURSING_HOME'), ('HOSPITAL'), ('DIAGNOSTIC_CENTRE')) AS t(clinic)
CROSS JOIN (VALUES
  ('ESTABLISHMENT_REGISTRATION_CERTIFICATE', 'MANDATORY'),
  ('IDENTITY_PROOF',                         'MANDATORY'),
  ('AUTHORIZATION_LETTER',                   'MANDATORY'),
  ('ADDRESS_PROOF',                          'OPTIONAL'),
  ('OTHER',                                  'OPTIONAL')
) AS k(kind, lvl);
