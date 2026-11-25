-- Distance rules for the additional collection charge: [{ "aboveKm": 5, "charge": 60 }, ...]
ALTER TABLE "site_settings" ADD COLUMN "collectionChargeTiers" JSONB;

-- The existing single rule becomes the first rule.
UPDATE "site_settings"
SET "collectionChargeTiers" = jsonb_build_array(jsonb_build_object('aboveKm', "farCollectionKm", 'charge', "farCollectionCharge"));
