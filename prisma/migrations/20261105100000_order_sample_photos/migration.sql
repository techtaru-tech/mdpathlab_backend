-- CreateTable
CREATE TABLE "order_sample_photos" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "phlebotomistId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_sample_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_sample_photos_orderId_idx" ON "order_sample_photos"("orderId");

-- AddForeignKey
ALTER TABLE "order_sample_photos" ADD CONSTRAINT "order_sample_photos_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

