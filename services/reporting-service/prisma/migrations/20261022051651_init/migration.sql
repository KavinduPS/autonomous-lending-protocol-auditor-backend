-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('PENDING', 'ANALYZING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "StageName" AS ENUM ('STATIC', 'RAG', 'EPA');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "DetectionSource" AS ENUM ('SLITHER', 'RAG');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'CONFIRMED', 'NOT_CONFIRMED');

-- CreateEnum
CREATE TYPE "ExploitOutcome" AS ENUM ('CONFIRMED', 'NOT_CONFIRMED', 'ERROR');

-- CreateTable
CREATE TABLE "audits" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "contract_name" TEXT NOT NULL,
    "source_uri" TEXT NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "baseline" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_stages" (
    "id" TEXT NOT NULL,
    "audit_id" TEXT NOT NULL,
    "stage" "StageName" NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'PENDING',
    "metrics" JSONB,

    CONSTRAINT "audit_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vulnerability_categories" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owasp_sc_ref" TEXT,
    "default_mitigation" TEXT,

    CONSTRAINT "vulnerability_categories_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" TEXT NOT NULL,
    "audit_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "detected_by" TEXT[],
    "triage_score" DECIMAL(65,30),
    "triage_decision" TEXT,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detections" (
    "id" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "source" "DetectionSource" NOT NULL,
    "rule_id" TEXT,
    "severity" "Severity" NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "description" TEXT NOT NULL,
    "file" TEXT,
    "line_start" INTEGER,
    "line_end" INTEGER,
    "raw" JSONB NOT NULL,

    CONSTRAINT "detections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exploit_attempts" (
    "id" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "poc_code" TEXT,
    "react_log" JSONB,
    "environment" JSONB,
    "evidence" JSONB,
    "outcome" "ExploitOutcome" NOT NULL,

    CONSTRAINT "exploit_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audits_user_id_created_at_idx" ON "audits"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_stages_audit_id_stage_key" ON "audit_stages"("audit_id", "stage");

-- CreateIndex
CREATE INDEX "findings_audit_id_severity_idx" ON "findings"("audit_id", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "detections_finding_id_source_key" ON "detections"("finding_id", "source");

-- CreateIndex
CREATE UNIQUE INDEX "exploit_attempts_finding_id_attempt_no_key" ON "exploit_attempts"("finding_id", "attempt_no");

-- AddForeignKey
ALTER TABLE "audit_stages" ADD CONSTRAINT "audit_stages_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_category_fkey" FOREIGN KEY ("category") REFERENCES "vulnerability_categories"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detections" ADD CONSTRAINT "detections_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exploit_attempts" ADD CONSTRAINT "exploit_attempts_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
