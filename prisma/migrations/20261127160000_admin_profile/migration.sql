-- Admin profile: contact number, and a credentials-changed time that ends older sessions after a password change.
-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "credentialsChangedAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT;

