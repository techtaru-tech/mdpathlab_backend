-- CreateTable
CREATE TABLE "site_settings" (
    "id" TEXT NOT NULL,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "bannerUrl" TEXT,
    "address" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "appStoreUrl" TEXT,
    "playStoreUrl" TEXT,
    "razorpayKeyId" TEXT,
    "razorpayKeySecret" TEXT,
    "razorpayWebhookSecret" TEXT,
    "onlinePaymentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "codEnabled" BOOLEAN NOT NULL DEFAULT true,
    "privacyPolicyContent" TEXT,
    "termsConditionsContent" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);
