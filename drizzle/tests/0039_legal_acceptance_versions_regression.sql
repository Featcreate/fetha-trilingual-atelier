-- Run after applying migrations through 0039 on a disposable/test database.
DO $$
DECLARE
  _store_function text;
  _signup_function text;
BEGIN
  SELECT pg_get_functiondef('public.create_seller_store(text,text,text,text,text)'::regprocedure)
  INTO _store_function;
  IF position('2026-11-08-v3' IN _store_function) = 0
     OR position('2026-10-31-v1' IN _store_function) = 0 THEN
    RAISE EXCEPTION 'test_failed: seller store creation must enforce current seller legal versions';
  END IF;

  SELECT pg_get_functiondef('public.require_terms_acceptance_on_signup()'::regprocedure)
  INTO _signup_function;
  IF position('2026-11-08-v5' IN _signup_function) = 0 THEN
    RAISE EXCEPTION 'test_failed: signup must enforce current public Terms version';
  END IF;
END;
$$;
