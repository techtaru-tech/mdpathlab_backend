-- AlterTable
ALTER TABLE "packages" ADD COLUMN     "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "parameters" ADD COLUMN     "displayParameterCount" INTEGER,
ADD COLUMN     "tag" TEXT;
