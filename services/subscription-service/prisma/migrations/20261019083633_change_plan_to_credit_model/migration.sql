/*
  Warnings:

  - You are about to drop the column `audits_per_period` on the `plans` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "plans" DROP COLUMN "audits_per_period",
ADD COLUMN     "api_access" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "credits_per_period" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'usd',
ADD COLUMN     "extra_credits_allowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "max_concurrent_audits" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "queue_priority" TEXT NOT NULL DEFAULT 'STANDARD';
