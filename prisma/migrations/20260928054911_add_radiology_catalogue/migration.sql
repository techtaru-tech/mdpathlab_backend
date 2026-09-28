-- AlterEnum
ALTER TYPE "CartItemType" ADD VALUE 'RADIOLOGY';

-- CreateTable
CREATE TABLE "radiology_tests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "testCode" TEXT NOT NULL,
    "shortDescription" TEXT,
    "modality" TEXT,
    "preparationInstructions" TEXT,
    "mrp" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "reportTimeHours" INTEGER NOT NULL,
    "fastingRequired" BOOLEAN NOT NULL DEFAULT false,
    "fastingHours" INTEGER,
    "categoryId" TEXT,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
    "tag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radiology_tests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "radiology_tests_slug_key" ON "radiology_tests"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "radiology_tests_testCode_key" ON "radiology_tests"("testCode");

-- AddForeignKey
ALTER TABLE "radiology_tests" ADD CONSTRAINT "radiology_tests_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
