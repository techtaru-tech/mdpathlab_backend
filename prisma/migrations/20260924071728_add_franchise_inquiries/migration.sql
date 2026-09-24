-- CreateEnum
CREATE TYPE "FranchiseInquiryStatus" AS ENUM ('NEW', 'CONTACTED');

-- CreateTable
CREATE TABLE "franchise_inquiries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city" TEXT NOT NULL,
    "investmentCapacity" TEXT NOT NULL,
    "message" TEXT,
    "status" "FranchiseInquiryStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "franchise_inquiries_pkey" PRIMARY KEY ("id")
);
