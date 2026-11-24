-- CreateTable
CREATE TABLE "phlebotomist_ratings" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "phlebotomistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phlebotomist_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "phlebotomist_ratings_orderId_key" ON "phlebotomist_ratings"("orderId");

-- CreateIndex
CREATE INDEX "phlebotomist_ratings_phlebotomistId_createdAt_idx" ON "phlebotomist_ratings"("phlebotomistId", "createdAt");

-- AddForeignKey
ALTER TABLE "phlebotomist_ratings" ADD CONSTRAINT "phlebotomist_ratings_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phlebotomist_ratings" ADD CONSTRAINT "phlebotomist_ratings_phlebotomistId_fkey" FOREIGN KEY ("phlebotomistId") REFERENCES "phlebotomists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phlebotomist_ratings" ADD CONSTRAINT "phlebotomist_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

