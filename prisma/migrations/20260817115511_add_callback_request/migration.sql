-- CreateEnum
CREATE TYPE "CallbackRequestStatus" AS ENUM ('NEW', 'CONTACTED');

-- CreateTable
CREATE TABLE "callback_requests" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "CallbackRequestStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "callback_requests_pkey" PRIMARY KEY ("id")
);
