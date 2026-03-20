ALTER TABLE github."repository"
ALTER COLUMN github_repo_id TYPE bigint;

ALTER TABLE github."issue"
ALTER COLUMN github_id TYPE bigint;
