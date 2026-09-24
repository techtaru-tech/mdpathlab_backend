-- CreateTable
CREATE TABLE "city_prices" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "itemType" "CartItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "mrp" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "city_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "city_prices_cityId_itemType_itemId_key" ON "city_prices"("cityId", "itemType", "itemId");

-- AddForeignKey
ALTER TABLE "city_prices" ADD CONSTRAINT "city_prices_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
