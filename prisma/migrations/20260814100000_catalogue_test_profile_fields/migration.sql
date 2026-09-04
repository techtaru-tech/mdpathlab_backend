-- Additive only. Parameter (8 existing rows) gets one new optional, unique "code" column — plain
-- @unique is correct here (not a partial index like slot_availability's) because multiple NULLs
-- are the desired behavior ("no code assigned yet"), not a scope value to disambiguate.
--
-- Profile currently has zero rows, so adding required NOT NULL columns (testCode) is safe with
-- no backfill needed.
ALTER TABLE "parameters" ADD COLUMN     "code" TEXT;

ALTER TABLE "profiles" ADD COLUMN     "preparationInstructions" TEXT,
ADD COLUMN     "sampleType" TEXT,
ADD COLUMN     "tag" TEXT,
ADD COLUMN     "testCode" TEXT NOT NULL;

CREATE UNIQUE INDEX "parameters_code_key" ON "parameters"("code");

CREATE UNIQUE INDEX "profiles_testCode_key" ON "profiles"("testCode");
