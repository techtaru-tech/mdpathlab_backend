-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "packages" ADD COLUMN     "categoryId" TEXT;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
