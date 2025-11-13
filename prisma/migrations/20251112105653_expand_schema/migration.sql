-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('REPORT');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('FREE', 'PAID');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('BHD', 'SAR', 'AED', 'QAR', 'KWD', 'OMR', 'USD');

-- CreateEnum
CREATE TYPE "ReportGenerationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAIL');

-- CreateEnum
CREATE TYPE "VoiceAgentsProvider" AS ENUM ('ELEVEN_LABS');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('Male', 'Female');

-- CreateTable
CREATE TABLE "WaitingList" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "WaitingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "mobileNumber" TEXT,
    "photo" TEXT,
    "profileComplete" BOOLEAN NOT NULL DEFAULT false,
    "verifyCode" TEXT,
    "newMobileNumber" TEXT,
    "language" TEXT DEFAULT 'en',
    "clinicId" INTEGER,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isClinicAdmin" BOOLEAN NOT NULL DEFAULT false,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" SERIAL NOT NULL,
    "anterior_teeth_raw" TEXT,
    "upper_teeth_raw" TEXT,
    "lower_teeth_raw" TEXT,
    "anterior_teeth_labeled" TEXT,
    "upper_teeth_labeled" TEXT,
    "lower_teeth_labeled" TEXT,
    "result" JSONB,
    "analyzed_issues" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "type" "ReportType" NOT NULL DEFAULT 'FREE',
    "userId" INTEGER NOT NULL,
    "transactionId" INTEGER,
    "status" "ReportGenerationStatus" NOT NULL,
    "error" TEXT,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactUs" (
    "id" SERIAL NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phoneNumber" TEXT DEFAULT '',
    "position" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "ContactUs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" SERIAL NOT NULL,
    "result" JSONB,
    "chargeId" TEXT,
    "serviceType" "ServiceType" NOT NULL,
    "userId" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voucherId" INTEGER,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "discountPercentage" DOUBLE PRECISION NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "clinicId" INTEGER,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryPricing" (
    "id" SERIAL NOT NULL,
    "country" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "pricing" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportReview" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ReportReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clinic" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "affiliateClinicAccessEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "photo" TEXT,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" SERIAL NOT NULL,
    "appointment_raw_details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceCall" (
    "id" SERIAL NOT NULL,
    "agentId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "collectedData" JSONB NOT NULL,
    "provider" "VoiceAgentsProvider" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clinicId" INTEGER,

    CONSTRAINT "VoiceCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentClinicAssignment" (
    "id" SERIAL NOT NULL,
    "agentId" TEXT NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AgentClinicAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicPermission" (
    "clinicId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,

    CONSTRAINT "ClinicPermission_pkey" PRIMARY KEY ("clinicId","permissionId")
);

-- CreateTable
CREATE TABLE "AgentPageConfig" (
    "id" SERIAL NOT NULL,
    "agentId" TEXT NOT NULL,
    "welcomeMessage" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '',
    "image" TEXT NOT NULL DEFAULT '',
    "agentAvatar" TEXT NOT NULL DEFAULT '',
    "agentName" TEXT NOT NULL DEFAULT '',
    "provider" "VoiceAgentsProvider" NOT NULL DEFAULT 'ELEVEN_LABS',
    "requiredInfo" JSONB NOT NULL DEFAULT '{}',
    "clinicId" INTEGER,
    "gender" "Gender" NOT NULL DEFAULT 'Male',
    "initialGreetingMessage" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPageConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaitingList_email_key" ON "WaitingList"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_mobileNumber_key" ON "User"("mobileNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_newMobileNumber_key" ON "User"("newMobileNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_chargeId_key" ON "Transaction"("chargeId");

-- CreateIndex
CREATE INDEX "chargeId" ON "Transaction"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_code_key" ON "Voucher"("code");

-- CreateIndex
CREATE INDEX "code" ON "Voucher"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CountryPricing_country_key" ON "CountryPricing"("country");

-- CreateIndex
CREATE UNIQUE INDEX "ReportReview_reportId_key" ON "ReportReview"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportReview_reportId_userId_key" ON "ReportReview"("reportId", "userId");

-- CreateIndex
CREATE INDEX "VoiceCall_agentId_idx" ON "VoiceCall"("agentId");

-- CreateIndex
CREATE INDEX "VoiceCall_status_idx" ON "VoiceCall"("status");

-- CreateIndex
CREATE INDEX "VoiceCall_clinicId_idx" ON "VoiceCall"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceCall_conversationId_key" ON "VoiceCall"("conversationId");

-- CreateIndex
CREATE INDEX "AgentClinicAssignment_agentId_idx" ON "AgentClinicAssignment"("agentId");

-- CreateIndex
CREATE INDEX "AgentClinicAssignment_clinicId_idx" ON "AgentClinicAssignment"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentClinicAssignment_agentId_key" ON "AgentClinicAssignment"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentClinicAssignment_agentId_clinicId_key" ON "AgentClinicAssignment"("agentId", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_name_key" ON "Permission"("name");

-- CreateIndex
CREATE INDEX "AgentPageConfig_agentId_idx" ON "AgentPageConfig"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPageConfig_agentId_key" ON "AgentPageConfig"("agentId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportReview" ADD CONSTRAINT "ReportReview_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportReview" ADD CONSTRAINT "ReportReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceCall" ADD CONSTRAINT "VoiceCall_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentClinicAssignment" ADD CONSTRAINT "AgentClinicAssignment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicPermission" ADD CONSTRAINT "ClinicPermission_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicPermission" ADD CONSTRAINT "ClinicPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPageConfig" ADD CONSTRAINT "AgentPageConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
