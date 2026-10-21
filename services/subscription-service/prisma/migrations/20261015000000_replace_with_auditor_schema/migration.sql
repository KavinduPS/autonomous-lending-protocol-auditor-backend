-- This replacement migration supports an empty legacy schema only.
-- Existing data requires an explicit backfill/mapping before these changes.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "plans")
        OR EXISTS (SELECT 1 FROM "plan_prices")
        OR EXISTS (SELECT 1 FROM "plan_entitlements")
        OR EXISTS (SELECT 1 FROM "customers")
        OR EXISTS (SELECT 1 FROM "subscriptions")
        OR EXISTS (SELECT 1 FROM "invoices")
        OR EXISTS (SELECT 1 FROM "payments")
        OR EXISTS (SELECT 1 FROM "usage_counters")
        OR EXISTS (SELECT 1 FROM "usage_events")
        OR EXISTS (SELECT 1 FROM "stripe_webhook_events") THEN
        RAISE EXCEPTION 'Auditor schema replacement requires empty legacy tables. Back up and migrate existing data explicitly, or reset a disposable development database.';
    END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS "citext";

-- DropForeignKey
ALTER TABLE "plan_prices" DROP CONSTRAINT "plan_prices_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "plan_entitlements" DROP CONSTRAINT "plan_entitlements_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_plan_price_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_subscription_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "usage_counters" DROP CONSTRAINT "usage_counters_subscription_id_fkey";

-- DropForeignKey
ALTER TABLE "usage_events" DROP CONSTRAINT "usage_events_subscription_id_fkey";

-- DropIndex
DROP INDEX "plans_stripe_product_id_key";

-- DropIndex
DROP INDEX "payments_stripe_payment_intent_id_key";

-- AlterTable
ALTER TABLE "plans" DROP COLUMN "created_at",
DROP COLUMN "description",
DROP COLUMN "is_active",
DROP COLUMN "name",
DROP COLUMN "stripe_product_id",
DROP COLUMN "updated_at",
ADD COLUMN     "audits_per_period" INTEGER NOT NULL,
ADD COLUMN     "exploit_simulation" BOOLEAN NOT NULL,
ADD COLUMN     "price_minor" BIGINT NOT NULL,
ADD COLUMN     "stripe_price_id" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "cancel_at_period_end",
DROP COLUMN "created_at",
DROP COLUMN "current_period_start",
DROP COLUMN "customer_id",
DROP COLUMN "plan_price_id",
DROP COLUMN "updated_at",
ADD COLUMN     "stripe_customer_id" TEXT,
ADD COLUMN     "user_id" UUID NOT NULL,
ALTER COLUMN "current_period_end" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "amount_minor",
DROP COLUMN "created_at",
DROP COLUMN "customer_id",
DROP COLUMN "invoice_id",
DROP COLUMN "stripe_payment_intent_id",
ADD COLUMN     "amount_paid_minor" BIGINT NOT NULL,
ADD COLUMN     "stripe_invoice_id" TEXT NOT NULL,
ADD COLUMN     "subscription_id" UUID NOT NULL;

-- DropTable
DROP TABLE "plan_prices";

-- DropTable
DROP TABLE "plan_entitlements";

-- DropTable
DROP TABLE "customers";

-- DropTable
DROP TABLE "invoices";

-- DropTable
DROP TABLE "usage_counters";

-- DropTable
DROP TABLE "usage_events";

-- DropTable
DROP TABLE "stripe_webhook_events";

-- CreateTable
CREATE TABLE "stripe_events" (
    "id" UUID NOT NULL,
    "stripe_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "role" TEXT NOT NULL,
    "auth_provider" TEXT NOT NULL,
    "provider_subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "user_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "doc_version" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("user_id","doc_type","doc_version")
);

-- CreateTable
CREATE TABLE "audits" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "source_uri" TEXT NOT NULL,
    "chain_id" BIGINT,
    "fork_block_number" BIGINT,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vulnerability_categories" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owasp_sc_ref" TEXT NOT NULL,
    "default_mitigation" TEXT NOT NULL,

    CONSTRAINT "vulnerability_categories_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "pdf_uri" TEXT,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_stages" (
    "id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,

    CONSTRAINT "audit_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "detected_by" TEXT[],
    "triage_score" DECIMAL,
    "triage_decision" TEXT,
    "verification_status" TEXT NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_documents" (
    "id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dataset_split" TEXT NOT NULL,
    "attack_steps" JSONB NOT NULL,

    CONSTRAINT "kb_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exploit_attempts" (
    "id" UUID NOT NULL,
    "finding_id" UUID NOT NULL,
    "attempt_no" SMALLINT NOT NULL,
    "poc_code" TEXT NOT NULL,
    "react_log" JSONB NOT NULL,
    "environment" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "outcome" TEXT NOT NULL,

    CONSTRAINT "exploit_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_chunks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "vector_id" TEXT NOT NULL,

    CONSTRAINT "kb_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stripe_events_stripe_event_id_key" ON "stripe_events"("stripe_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_provider_subject_key" ON "users"("provider_subject");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "kb_chunks_vector_id_key" ON "kb_chunks"("vector_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_stripe_price_id_key" ON "plans"("stripe_price_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_customer_id_key" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_invoice_id_key" ON "payments"("stripe_invoice_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "audits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_stages" ADD CONSTRAINT "audit_stages_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "audits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "audits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_category_fkey" FOREIGN KEY ("category") REFERENCES "vulnerability_categories"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_documents" ADD CONSTRAINT "kb_documents_category_fkey" FOREIGN KEY ("category") REFERENCES "vulnerability_categories"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exploit_attempts" ADD CONSTRAINT "exploit_attempts_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "kb_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
