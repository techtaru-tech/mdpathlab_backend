/*
  Warnings:

  - You are about to drop the column `isPackage` on the `order_items` table. All the data in the column will be lost.
  - The `itemType` column on the `order_items` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "isPackage",
DROP COLUMN "itemType",
ADD COLUMN     "itemType" "CartItemType" NOT NULL DEFAULT 'PARAMETER';
