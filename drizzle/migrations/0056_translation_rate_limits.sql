-- Security hardening: per-user translation throttling and restricted execution.
-- The service-role-only RPC is called only after the Edge Function validates the user's JWT.

CREATE TABLE IF NOT EXISTS public.translation_rate_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  minute_window timestamptz NOT NULL,
  minute_count integer NOT NULL DEFAULT 0 CHECK (minute_count >= 0),
  hour_window timestamptz NOT NULL,
  hour_count integer NOT NULL DEFAULT 0 CHECK (hour_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.translation_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.translation_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.translation_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_translation_rate_limit(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _minute timestamptz := date_trunc('minute', now());
  _hour timestamptz := date_trunc('hour', now());
BEGIN
  IF auth.role() <> 'service_role' OR _user_id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.translation_rate_limits (
    user_id, minute_window, minute_count, hour_window, hour_count, updated_at
  )
  VALUES (_user_id, _minute, 1, _hour, 1, now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    minute_count = CASE
      WHEN public.translation_rate_limits.minute_window = _minute
        THEN public.translation_rate_limits.minute_count + 1
      ELSE 1
    END,
    minute_window = _minute,
    hour_count = CASE
      WHEN public.translation_rate_limits.hour_window = _hour
        THEN public.translation_rate_limits.hour_count + 1
      ELSE 1
    END,
    hour_window = _hour,
    updated_at = now()
  WHERE
    (CASE
      WHEN public.translation_rate_limits.minute_window = _minute
        THEN public.translation_rate_limits.minute_count
      ELSE 0
    END) < 10
    AND
    (CASE
      WHEN public.translation_rate_limits.hour_window = _hour
        THEN public.translation_rate_limits.hour_count
      ELSE 0
    END) < 100
  RETURNING user_id INTO _user_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_translation_rate_limit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_translation_rate_limit(uuid) TO service_role;

COMMENT ON FUNCTION public.consume_translation_rate_limit(uuid) IS
  'Atomically permits at most 10 translation requests per user per minute and 100 per user per hour. Service-role only.';
