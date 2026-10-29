ALTER TABLE "job_ingestion_runs"
ADD COLUMN "fetch_attempts" INTEGER NOT NULL DEFAULT 1;
