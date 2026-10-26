-- Admin switches for doctor/clinic registration and patient referrals (Admin → Settings → Doctors & Referrals).
-- Additive only: two columns on the single site_settings row, both off, so behaviour is unchanged until an admin turns them on.

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "referralPartnersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referralsEnabled" BOOLEAN NOT NULL DEFAULT false;
