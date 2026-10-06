-- AlterTable
ALTER TABLE "parameters" ADD COLUMN "componentNames" TEXT[] DEFAULT ARRAY[]::TEXT[];
