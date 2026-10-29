CREATE TABLE "job_ingestion_runs" (
    "id" TEXT NOT NULL,
    "job_source_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "normalized_listings_seen" INTEGER NOT NULL DEFAULT 0,
    "listings_created" INTEGER NOT NULL DEFAULT 0,
    "existing_listings_observed" INTEGER NOT NULL DEFAULT 0,
    "stale_observations_suppressed" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,

    CONSTRAINT "job_ingestion_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_ingestion_runs_job_source_id_completed_at_idx"
ON "job_ingestion_runs"("job_source_id", "completed_at");
CREATE INDEX "job_ingestion_runs_provider_completed_at_idx"
ON "job_ingestion_runs"("provider", "completed_at");

ALTER TABLE "job_ingestion_runs"
ADD CONSTRAINT "job_ingestion_runs_job_source_id_fkey"
FOREIGN KEY ("job_source_id") REFERENCES "job_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "job_quality_snapshots" (
    "id" TEXT NOT NULL,
    "observed_on" TIMESTAMP(3) NOT NULL,
    "measured_at" TIMESTAMP(3) NOT NULL,
    "canonical_listings" INTEGER NOT NULL,
    "source_observations" INTEGER NOT NULL,
    "listings_seen_within_24_hours" INTEGER NOT NULL,
    "listings_with_posted_at" INTEGER NOT NULL,
    "median_listing_age_hours" DOUBLE PRECISION,
    "cross_provider_collisions" INTEGER NOT NULL,
    "cross_provider_extra_observations" INTEGER NOT NULL,
    "listings_with_location" INTEGER NOT NULL,
    "listings_with_work_mode" INTEGER NOT NULL,
    "listings_with_description" INTEGER NOT NULL,
    "listings_with_content_language" INTEGER NOT NULL,

    CONSTRAINT "job_quality_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_quality_snapshots_observed_on_key"
ON "job_quality_snapshots"("observed_on");
