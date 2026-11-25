-- Lab map pin (additional collection charge by distance)
ALTER TABLE "labs" ADD COLUMN "lat" DOUBLE PRECISION, ADD COLUMN "lng" DOUBLE PRECISION;

-- Charges, reminder timing and editable message texts
ALTER TABLE "site_settings"
  ADD COLUMN "farCollectionKm" DOUBLE PRECISION NOT NULL DEFAULT 5,
  ADD COLUMN "farCollectionCharge" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "printingCharge" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "reminderHoursBefore" DOUBLE PRECISION NOT NULL DEFAULT 2,
  ADD COLUMN "messageTemplates" JSONB;

-- Per booking: distance, Go Green / printed reports, reminder, arrival and delay
ALTER TABLE "orders"
  ADD COLUMN "collectionDistanceKm" DOUBLE PRECISION,
  ADD COLUMN "printedReport" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "printingCharge" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reminderSentAt" TIMESTAMP(3),
  ADD COLUMN "expectedArrivalAt" TIMESTAMP(3),
  ADD COLUMN "delayNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "delayMinutes" INTEGER;

-- Bookings that were already sent or are past need no reminder
UPDATE "orders" SET "reminderSentAt" = NOW() WHERE "scheduledDate" < CURRENT_DATE OR "status" IN ('CANCELLED','SAMPLE_COLLECTED','IN_LAB','REPORT_READY');
