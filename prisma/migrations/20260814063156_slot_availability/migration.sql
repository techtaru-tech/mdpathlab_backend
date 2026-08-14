-- CreateTable
CREATE TABLE "slot_availability" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "collectionType" "CollectionType",
    "collectionCenterId" TEXT,
    "capacity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slot_availability_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "slot_availability" ADD CONSTRAINT "slot_availability_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_availability" ADD CONSTRAINT "slot_availability_collectionCenterId_fkey" FOREIGN KEY ("collectionCenterId") REFERENCES "collection_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A centre can only be set on a CENTER-scoped row — prevents a nonsensical "HOME, but also tied
-- to this specific centre" or "global, but tied to a centre" row from ever being inserted.
ALTER TABLE "slot_availability" ADD CONSTRAINT "slot_availability_centre_requires_center_type"
  CHECK ("collectionCenterId" IS NULL OR "collectionType" = 'CENTER');

-- Four partial unique indexes — one per scope "shape" — instead of one composite @@unique,
-- because Postgres treats NULL as distinct from NULL in a unique constraint: a single composite
-- index including the nullable collectionType/collectionCenterId columns would silently allow
-- unlimited duplicate rows for the "global" and "HOME" shapes (both of which are NULL in
-- collectionCenterId, and the global shape is also NULL in collectionType). See the cart_items
-- migration for the same NULL-distinctness issue solved the same way.
--
--   (slotId, date)                                    with collectionType IS NULL      -> global, one row per slot/date
--   (slotId, date)                                    with collectionType = 'HOME'     -> HOME-specific, one row per slot/date
--   (slotId, date)                                    with collectionType = 'CENTER'
--                                                           AND collectionCenterId IS NULL -> CENTER-wide (all centres), one row per slot/date
--   (slotId, date, collectionCenterId)                with collectionType = 'CENTER'
--                                                           AND collectionCenterId IS NOT NULL -> centre-specific, one row per slot/date/centre
CREATE UNIQUE INDEX "slot_availability_global_key"
  ON "slot_availability" ("slotId", "date")
  WHERE "collectionType" IS NULL;

CREATE UNIQUE INDEX "slot_availability_home_key"
  ON "slot_availability" ("slotId", "date")
  WHERE "collectionType" = 'HOME';

CREATE UNIQUE INDEX "slot_availability_center_wide_key"
  ON "slot_availability" ("slotId", "date")
  WHERE "collectionType" = 'CENTER' AND "collectionCenterId" IS NULL;

CREATE UNIQUE INDEX "slot_availability_center_specific_key"
  ON "slot_availability" ("slotId", "date", "collectionCenterId")
  WHERE "collectionType" = 'CENTER' AND "collectionCenterId" IS NOT NULL;
