-- Migration 021: Create analytics tracking system (events, sessions, views) with RLS and consent
-- Idempotent where possible

-- 1) Consent flags on users_profile
ALTER TABLE users_profile
ADD COLUMN IF NOT EXISTS analytics_consent BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS assistant_consent BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS data_privacy_level TEXT NOT NULL DEFAULT 'standard';

-- 2) Sessions table
CREATE TABLE IF NOT EXISTS analytics_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_event_at TIMESTAMPTZ,
  device TEXT,
  platform TEXT,
  app_version TEXT,
  locale TEXT,
  timezone TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user_started_at ON analytics_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_event_at ON analytics_sessions(last_event_at DESC);

ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_sessions_select_own ON analytics_sessions;
CREATE POLICY analytics_sessions_select_own ON analytics_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS analytics_sessions_insert_own ON analytics_sessions;
CREATE POLICY analytics_sessions_insert_own ON analytics_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS analytics_sessions_update_own ON analytics_sessions;
CREATE POLICY analytics_sessions_update_own ON analytics_sessions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS analytics_sessions_delete_own ON analytics_sessions;
CREATE POLICY analytics_sessions_delete_own ON analytics_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- 3) Events table
CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES analytics_sessions(id) ON DELETE SET NULL,
  org_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'app', -- app, system, assistant
  privacy_level TEXT NOT NULL DEFAULT 'standard', -- standard|minimal|none
  context JSONB NOT NULL DEFAULT '{}', -- screen, route, device hints
  properties JSONB NOT NULL DEFAULT '{}', -- event-specific
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_time ON analytics_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_time ON analytics_events(event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_org ON analytics_events(org_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_gin_context ON analytics_events USING GIN (context);
CREATE INDEX IF NOT EXISTS idx_analytics_events_gin_properties ON analytics_events USING GIN (properties);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_events_select_own ON analytics_events;
CREATE POLICY analytics_events_select_own ON analytics_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS analytics_events_insert_own ON analytics_events;
CREATE POLICY analytics_events_insert_own ON analytics_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS analytics_events_update_own ON analytics_events;
CREATE POLICY analytics_events_update_own ON analytics_events
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS analytics_events_delete_own ON analytics_events;
CREATE POLICY analytics_events_delete_own ON analytics_events
  FOR DELETE USING (auth.uid() = user_id);

-- 4) Helper function to enforce consent on inserts
CREATE OR REPLACE FUNCTION can_track_event_for_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed BOOLEAN;
BEGIN
  SELECT analytics_consent INTO v_allowed
  FROM users_profile
  WHERE user_id = p_user_id;

  RETURN COALESCE(v_allowed, TRUE);
END;
$$;

-- 5) Trigger to prevent event insert when analytics_consent = false
CREATE OR REPLACE FUNCTION trg_analytics_events_block_without_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT can_track_event_for_user(NEW.user_id) THEN
    RAISE EXCEPTION 'Analytics tracking disabled by user consent';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_insert_analytics_events_consent ON analytics_events;
CREATE TRIGGER before_insert_analytics_events_consent
BEFORE INSERT ON analytics_events
FOR EACH ROW
EXECUTE FUNCTION trg_analytics_events_block_without_consent();

-- 6) Basic analytics views
CREATE OR REPLACE VIEW analytics_daily_active_users AS
SELECT
  date_trunc('day', occurred_at) AS day,
  COUNT(DISTINCT user_id) AS dau
FROM analytics_events
GROUP BY 1
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW analytics_feature_usage AS
SELECT
  date_trunc('day', occurred_at) AS day,
  event_type,
  COUNT(*) AS events,
  COUNT(DISTINCT user_id) AS unique_users
FROM analytics_events
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;

-- 7) Minimal sample policies for views (views inherit base table RLS)
-- No explicit policies needed; RLS on base tables applies.





