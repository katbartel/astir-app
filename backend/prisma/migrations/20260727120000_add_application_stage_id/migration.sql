ALTER TABLE "applications" ADD COLUMN "stage_id" TEXT NOT NULL DEFAULT 'applied';

UPDATE "applications"
SET "stage_id" = CASE LOWER("status")
  WHEN 'applied' THEN 'applied'
  WHEN '1st stage' THEN 'progress-1'
  WHEN '2nd stage' THEN 'progress-2'
  WHEN '3rd stage' THEN 'progress-3'
  WHEN 'offer' THEN 'offer'
  WHEN 'hired' THEN 'hired'
  WHEN 'closed' THEN 'closed'
  WHEN 'rejected' THEN 'closed'
  ELSE "stage_id"
END;
