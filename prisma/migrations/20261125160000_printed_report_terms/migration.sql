-- Printed reports: when the patient agreed to pay the courier / postage charges (no fixed printing charge any more)
ALTER TABLE "orders" ADD COLUMN "printedReportTermsAcceptedAt" TIMESTAMP(3);
