/*
  Warnings:

  - You are about to drop the `audit_stages` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `audits` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `consents` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `exploit_attempts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `findings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `kb_chunks` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `kb_documents` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `reports` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `security_events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sessions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `vulnerability_categories` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "audit_stages" DROP CONSTRAINT "audit_stages_audit_id_fkey";

-- DropForeignKey
ALTER TABLE "audits" DROP CONSTRAINT "audits_user_id_fkey";

-- DropForeignKey
ALTER TABLE "consents" DROP CONSTRAINT "consents_user_id_fkey";

-- DropForeignKey
ALTER TABLE "exploit_attempts" DROP CONSTRAINT "exploit_attempts_finding_id_fkey";

-- DropForeignKey
ALTER TABLE "findings" DROP CONSTRAINT "findings_audit_id_fkey";

-- DropForeignKey
ALTER TABLE "findings" DROP CONSTRAINT "findings_category_fkey";

-- DropForeignKey
ALTER TABLE "kb_chunks" DROP CONSTRAINT "kb_chunks_document_id_fkey";

-- DropForeignKey
ALTER TABLE "kb_documents" DROP CONSTRAINT "kb_documents_category_fkey";

-- DropForeignKey
ALTER TABLE "reports" DROP CONSTRAINT "reports_audit_id_fkey";

-- DropForeignKey
ALTER TABLE "security_events" DROP CONSTRAINT "security_events_user_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_user_id_fkey";

-- DropTable
DROP TABLE "audit_stages";

-- DropTable
DROP TABLE "audits";

-- DropTable
DROP TABLE "consents";

-- DropTable
DROP TABLE "exploit_attempts";

-- DropTable
DROP TABLE "findings";

-- DropTable
DROP TABLE "kb_chunks";

-- DropTable
DROP TABLE "kb_documents";

-- DropTable
DROP TABLE "reports";

-- DropTable
DROP TABLE "security_events";

-- DropTable
DROP TABLE "sessions";

-- DropTable
DROP TABLE "users";

-- DropTable
DROP TABLE "vulnerability_categories";
