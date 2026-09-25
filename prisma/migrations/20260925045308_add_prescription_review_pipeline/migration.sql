-- CreateEnum
CREATE TYPE "LabPrescriptionStage" AS ENUM ('UPLOADED', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'REVIEWED', 'READY_FOR_BOOKING', 'BOOKING_CONFIRMED');

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "clarificationNote" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "labStage" "LabPrescriptionStage",
ADD COLUMN     "patientReply" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "prescription_recommended_tests" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "itemType" "CartItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT,
    "price" INTEGER NOT NULL,
    "mrp" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "unavailableNote" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_recommended_tests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prescription_recommended_tests_prescriptionId_itemType_item_key" ON "prescription_recommended_tests"("prescriptionId", "itemType", "itemId");

-- AddForeignKey
ALTER TABLE "prescription_recommended_tests" ADD CONSTRAINT "prescription_recommended_tests_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
