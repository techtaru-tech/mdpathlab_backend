-- MOU signing: the system generates the MOU, the partner downloads, signs and uploads it, admin verifies; rates apply
-- only once verified. Admin-editable MOU terms.
-- CreateEnum
CREATE TYPE "MouSignatureStatus" AS ENUM ('AWAITING_SIGNATURE', 'SIGNED_UPLOADED', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "commission_settings" ADD COLUMN     "mouTerms" TEXT;

-- AlterTable
ALTER TABLE "partner_commission_mous" ADD COLUMN     "mouNumber" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "signatureStatus" "MouSignatureStatus" NOT NULL DEFAULT 'AWAITING_SIGNATURE',
ADD COLUMN     "signedUploadedAt" TIMESTAMP(3),
ADD COLUMN     "signedUploadedBy" TEXT,
ADD COLUMN     "termsSnapshot" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedByAdminId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "partner_commission_mous_mouNumber_key" ON "partner_commission_mous"("mouNumber");


-- MOUs made before this change were already treated as in force: keep them so (verified when created) and number them.
UPDATE "partner_commission_mous"
SET "signatureStatus" = 'VERIFIED', "verifiedAt" = "createdAt", "verifiedByAdminId" = "createdByAdminId",
    "signedUploadedAt" = CASE WHEN "documentUrl" IS NOT NULL THEN "createdAt" END,
    "signedUploadedBy" = CASE WHEN "documentUrl" IS NOT NULL THEN 'ADMIN' END;
UPDATE "partner_commission_mous" m
SET "mouNumber" = 'MDPL-MOU-' || to_char(n."createdAt", 'YYYY') || '-' || lpad(n.rn::text, 4, '0')
FROM (SELECT id, "createdAt", row_number() OVER (ORDER BY "createdAt", id) AS rn FROM "partner_commission_mous") n
WHERE n.id = m.id;
