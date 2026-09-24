-- CreateEnum
CREATE TYPE "PincodeNotifyStatus" AS ENUM ('PENDING', 'NOTIFIED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "labId" TEXT;

-- AlterTable
ALTER TABLE "phlebotomists" ADD COLUMN     "labId" TEXT;

-- CreateTable
CREATE TABLE "labs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerName" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "servicePincodes" TEXT[],
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_catalogue_items" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "itemType" "CartItemType" NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "lab_catalogue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_result_values" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "parameterId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_result_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pincode_notify_requests" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "status" "PincodeNotifyStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pincode_notify_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "labs_email_key" ON "labs"("email");

-- CreateIndex
CREATE UNIQUE INDEX "lab_catalogue_items_labId_itemType_itemId_key" ON "lab_catalogue_items"("labId", "itemType", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "lab_result_values_orderId_parameterId_key" ON "lab_result_values"("orderId", "parameterId");

-- AddForeignKey
ALTER TABLE "phlebotomists" ADD CONSTRAINT "phlebotomists_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_catalogue_items" ADD CONSTRAINT "lab_catalogue_items_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_result_values" ADD CONSTRAINT "lab_result_values_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_result_values" ADD CONSTRAINT "lab_result_values_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "parameters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
