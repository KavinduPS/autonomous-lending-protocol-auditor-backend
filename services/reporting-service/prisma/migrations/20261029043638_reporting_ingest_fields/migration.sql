-- AlterEnum
ALTER TYPE "StageName" ADD VALUE 'SIMULATION';

-- AlterTable
ALTER TABLE "audits" ADD COLUMN     "block_number" INTEGER,
ADD COLUMN     "chain" TEXT,
ADD COLUMN     "compiler_version" TEXT,
ADD COLUMN     "slither_version" TEXT,
ADD COLUMN     "source_sha256" TEXT;

-- AlterTable
ALTER TABLE "detections" ADD COLUMN     "source_ref" TEXT;

-- AlterTable
ALTER TABLE "exploit_attempts" ADD COLUMN     "trace" TEXT;

-- AlterTable
ALTER TABLE "findings" ADD COLUMN     "contract_name" TEXT,
ADD COLUMN     "file" TEXT,
ADD COLUMN     "function_name" TEXT,
ADD COLUMN     "line_end" INTEGER,
ADD COLUMN     "line_start" INTEGER,
ADD COLUMN     "triage_reason" TEXT;

-- CreateIndex
CREATE INDEX "detections_source_ref_idx" ON "detections"("source_ref");
