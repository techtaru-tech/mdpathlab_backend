-- CreateEnum
CREATE TYPE "ContactQueryStatus" AS ENUM ('NEW', 'CONTACTED');

-- CreateTable
CREATE TABLE "contact_queries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "message" TEXT NOT NULL,
    "status" "ContactQueryStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_queries_pkey" PRIMARY KEY ("id")
);
