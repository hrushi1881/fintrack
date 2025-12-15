-- Safe cleanup: soft-delete duplicate categories per user and parent_id
-- Keeps the newest (latest created_at) active; soft-deletes older duplicates

WITH ranked AS (
  SELECT
    id,
    user_id,
    name,
    parent_id,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, name, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000')
      ORDER BY created_at DESC
    ) AS rn
  FROM categories
  WHERE is_deleted = false
)
UPDATE categories AS c
SET is_deleted = true,
    deleted_at = NOW()
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- Optional: report how many were affected (for manual run)
-- SELECT COUNT(*) FROM ranked WHERE rn > 1;













