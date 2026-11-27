-- MD Path Lab's signatory and signature / stamp image, printed on every generated MOU.
-- AlterTable
ALTER TABLE "commission_settings" ADD COLUMN     "mouSignatoryDesignation" TEXT,
ADD COLUMN     "mouSignatoryName" TEXT,
ADD COLUMN     "mouSignatureUrl" TEXT;

