-- CreateEnum
CREATE TYPE "HomeVisitStatus" AS ENUM ('REQUESTED', 'ASSIGNED', 'ON_THE_WAY', 'ARRIVED', 'TESTS_ADDED', 'COLLECTED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "HomeVisitWindow" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');

-- CreateTable
CREATE TABLE "home_collection_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "age" INTEGER,
    "gender" TEXT,
    "concern" TEXT,
    "addressId" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "preferredDate" DATE NOT NULL,
    "preferredWindow" "HomeVisitWindow" NOT NULL,
    "status" "HomeVisitStatus" NOT NULL DEFAULT 'REQUESTED',
    "labId" TEXT,
    "phlebotomistId" TEXT,
    "eta" TIMESTAMP(3),
    "orderId" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_collection_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "home_collection_requests_orderId_key" ON "home_collection_requests"("orderId");

-- CreateIndex
CREATE INDEX "home_collection_requests_userId_createdAt_idx" ON "home_collection_requests"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "home_collection_requests_status_preferredDate_idx" ON "home_collection_requests"("status", "preferredDate");

-- AddForeignKey
ALTER TABLE "home_collection_requests" ADD CONSTRAINT "home_collection_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_collection_requests" ADD CONSTRAINT "home_collection_requests_phlebotomistId_fkey" FOREIGN KEY ("phlebotomistId") REFERENCES "phlebotomists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_collection_requests" ADD CONSTRAINT "home_collection_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
