-- CreateEnum
CREATE TYPE "JobOpeningStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "JobEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "JobApplicationStatus" AS ENUM ('NEW', 'SHORTLISTED', 'REJECTED', 'HIRED');

-- CreateTable
CREATE TABLE "job_openings" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT NOT NULL,
    "employmentType" "JobEmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "experience" TEXT,
    "salary" TEXT,
    "openings" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "status" "JobOpeningStatus" NOT NULL DEFAULT 'OPEN',
    "labId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city" TEXT,
    "experience" TEXT,
    "message" TEXT,
    "resumeUrl" TEXT,
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_openings_slug_key" ON "job_openings"("slug");

-- CreateIndex
CREATE INDEX "job_openings_status_createdAt_idx" ON "job_openings"("status", "createdAt");

-- CreateIndex
CREATE INDEX "job_openings_labId_idx" ON "job_openings"("labId");

-- CreateIndex
CREATE INDEX "job_applications_jobId_createdAt_idx" ON "job_applications"("jobId", "createdAt");

-- AddForeignKey
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job_openings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

