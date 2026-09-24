-- AlterTable
ALTER TABLE "labs" ADD COLUMN     "accreditationNumber" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "pathologistName" TEXT,
ADD COLUMN     "pathologistQualification" TEXT;

-- AlterTable
ALTER TABLE "parameters" ADD COLUMN     "referenceRange" TEXT;
