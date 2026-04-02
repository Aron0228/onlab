DROP TABLE IF EXISTS github."pull_request";

ALTER TABLE github."issue"
DROP COLUMN IF EXISTS github_issue_number;

ALTER TABLE auth."user"
ALTER COLUMN github_id TYPE integer;
