-- CreateEnum
CREATE TYPE "ServiceAreaRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "lab_service_area_requests" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "note" TEXT,
    "status" "ServiceAreaRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "lab_service_area_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lab_service_area_requests_labId_status_idx" ON "lab_service_area_requests"("labId", "status");

-- AddForeignKey
ALTER TABLE "lab_service_area_requests" ADD CONSTRAINT "lab_service_area_requests_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
