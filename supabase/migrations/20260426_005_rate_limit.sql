-- B-Logix persistent rate limiter
-- Tracks login attempts per IP and per username across serverless cold starts.
-- Limits: 30 attempts / 15 min per IP, 10 attempts / 15 min per username.

CREATE TABLE IF NOT EXISTS bl_rate_limits (
  scope       text        NOT NULL,
  key         text        NOT NULL,
  count       integer     NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);

ALTER TABLE bl_rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; no other role needs access.
-- (No RLS policies needed — service_role bypasses them entirely.)

-- bl_rate_limit_hit(p_scope, p_key, p_max, p_window_seconds)
-- Atomically increments the counter, rolling the window if expired.
-- Returns the new count so the caller can decide whether to block.
CREATE OR REPLACE FUNCTION bl_rate_limit_hit(
  p_scope   text,
  p_key     text,
  p_max     integer,
  p_window  integer  -- seconds
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count  integer;
  v_start  timestamptz;
BEGIN
  SELECT count, window_start INTO v_count, v_start
  FROM bl_rate_limits
  WHERE scope = p_scope AND key = p_key
  FOR UPDATE;

  IF NOT FOUND OR (now() - v_start) > make_interval(secs => p_window) THEN
    -- Fresh window
    INSERT INTO bl_rate_limits (scope, key, count, window_start)
    VALUES (p_scope, p_key, 1, now())
    ON CONFLICT (scope, key)
    DO UPDATE SET count = 1, window_start = now();
    RETURN 1;
  ELSE
    -- Existing window: increment
    UPDATE bl_rate_limits
    SET count = count + 1
    WHERE scope = p_scope AND key = p_key;
    RETURN v_count + 1;
  END IF;
END;
$$;

-- bl_rate_limit_reset(p_scope, p_key)
-- Clears the counter (called after successful login to free the IP window).
CREATE OR REPLACE FUNCTION bl_rate_limit_reset(
  p_scope text,
  p_key   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM bl_rate_limits WHERE scope = p_scope AND key = p_key;
END;
$$;
