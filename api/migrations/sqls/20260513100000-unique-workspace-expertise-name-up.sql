WITH duplicate_expertise AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY workspace_id, LOWER(TRIM(name))
      ORDER BY id
    ) AS keep_id
  FROM "system"."expertise"
),
duplicate_user_expertise AS (
  SELECT assoc.id
  FROM "system"."user_expertise_assoc" assoc
  JOIN duplicate_expertise duplicate
    ON duplicate.id = assoc.expertise_id
  WHERE duplicate.id <> duplicate.keep_id
    AND EXISTS (
      SELECT 1
      FROM "system"."user_expertise_assoc" existing
      WHERE existing.user_id = assoc.user_id
        AND existing.expertise_id = duplicate.keep_id
    )
)
DELETE FROM "system"."user_expertise_assoc" assoc
USING duplicate_user_expertise duplicate_assoc
WHERE assoc.id = duplicate_assoc.id;

WITH duplicate_expertise AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY workspace_id, LOWER(TRIM(name))
      ORDER BY id
    ) AS keep_id
  FROM "system"."expertise"
)
UPDATE "system"."user_expertise_assoc" assoc
SET expertise_id = duplicate.keep_id
FROM duplicate_expertise duplicate
WHERE assoc.expertise_id = duplicate.id
  AND duplicate.id <> duplicate.keep_id;

WITH duplicate_expertise AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY workspace_id, LOWER(TRIM(name))
      ORDER BY id
    ) AS keep_id
  FROM "system"."expertise"
)
DELETE FROM "system"."expertise" expertise
USING duplicate_expertise duplicate
WHERE expertise.id = duplicate.id
  AND duplicate.id <> duplicate.keep_id;

CREATE UNIQUE INDEX IF NOT EXISTS expertise_unique_workspace_lower_name
  ON "system"."expertise" (workspace_id, LOWER(TRIM(name)));
