WITH canonical AS (
  SELECT id
  FROM remote_companies
  WHERE name_key = 'chili piper'
  LIMIT 1
),
duplicate AS (
  SELECT *
  FROM remote_companies
  WHERE name_key = 'chilli piper'
  LIMIT 1
)
UPDATE remote_companies canonical_row
SET
  careers_url = COALESCE(canonical_row.careers_url, duplicate.careers_url),
  company_website = COALESCE(canonical_row.company_website, duplicate.company_website),
  note = COALESCE(canonical_row.note, duplicate.note),
  reviewed = canonical_row.reviewed OR duplicate.reviewed,
  review_status = CASE
    WHEN canonical_row.review_status = 'not_reviewed' THEN duplicate.review_status
    ELSE canonical_row.review_status
  END,
  remote_policy_status = CASE
    WHEN duplicate.remote_policy_status = 'uncertain' THEN 'uncertain'
    ELSE canonical_row.remote_policy_status
  END,
  job_source_id = COALESCE(canonical_row.job_source_id, duplicate.job_source_id),
  resolution_status = CASE
    WHEN canonical_row.resolution_status = 'resolved' THEN canonical_row.resolution_status
    ELSE duplicate.resolution_status
  END
FROM duplicate
WHERE canonical_row.id = (SELECT id FROM canonical);

DELETE FROM remote_companies
WHERE name_key = 'chilli piper'
  AND EXISTS (SELECT 1 FROM remote_companies WHERE name_key = 'chili piper');

UPDATE remote_companies
SET name = 'Chili Piper',
    name_key = 'chili piper'
WHERE name_key = 'chilli piper';
