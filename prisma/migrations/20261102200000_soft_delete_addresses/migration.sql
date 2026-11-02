-- Deleting a saved address hides it (deletedAt) instead of removing the row, so past bookings keep their address.
-- Additive, nullable; no existing row changes.

-- AlterTable
ALTER TABLE "addresses" ADD COLUMN     "deletedAt" TIMESTAMP(3);

