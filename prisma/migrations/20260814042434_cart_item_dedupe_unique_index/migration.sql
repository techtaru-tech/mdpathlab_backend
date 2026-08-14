-- Enforces the cart's dedup key — (userId, itemType, itemId, familyMemberId) — at the database
-- level, closing the race window in CartService.add()'s findFirst()-then-create() check.
--
-- Two indexes are needed (not one plain @@unique) because Postgres treats NULL as distinct from
-- NULL in a unique constraint: a single composite unique index including familyMemberId would
-- silently allow unlimited duplicate rows whenever familyMemberId is NULL (i.e. exactly the "no
-- patient assigned yet" case that produced the originally reported duplicate). Splitting by
-- IS NOT NULL / IS NULL covers both cases correctly:
--   - same user + same item + same patient        -> blocked by the first index
--   - same user + same item + no patient assigned  -> blocked by the second index
--   - same user + same item + a DIFFERENT patient   -> allowed (different familyMemberId value)
--   - same user + a different item                  -> allowed (different itemId)
CREATE UNIQUE INDEX "cart_items_user_item_patient_key"
  ON "cart_items" ("userId", "itemType", "itemId", "familyMemberId")
  WHERE "familyMemberId" IS NOT NULL;

CREATE UNIQUE INDEX "cart_items_user_item_no_patient_key"
  ON "cart_items" ("userId", "itemType", "itemId")
  WHERE "familyMemberId" IS NULL;
