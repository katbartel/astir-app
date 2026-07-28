ALTER TABLE "remote_companies" ADD COLUMN "review_status" TEXT NOT NULL DEFAULT 'not_reviewed';

UPDATE "remote_companies"
SET "review_status" = 'reviewed'
WHERE "reviewed" = true;
