-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "labId" TEXT,
ADD COLUMN     "pincode" TEXT;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
