-- Align seller onboarding with the current seller terms and public terms versions.
-- No payment, commission calculation, seller ledger, fee allocation, or payout behavior is changed.

CREATE OR REPLACE FUNCTION public.create_seller_store(
  _name text,
  _slug text,
  _privacy_version text,
  _terms_version text,
  _language text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _store_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_email_verified(_uid) THEN
    RAISE EXCEPTION 'email_verification_required';
  END IF;

  IF _privacy_version IS DISTINCT FROM '2026-10-31-v1'
     OR _terms_version IS DISTINCT FROM '2026-11-03-v2' THEN
    RAISE EXCEPTION 'legal_documents_outdated';
  END IF;

  IF _language IS NULL OR _language NOT IN ('fr', 'ar', 'en') THEN
    RAISE EXCEPTION 'invalid_acceptance_language';
  END IF;

  IF _name IS NULL OR length(trim(_name)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid_store_name';
  END IF;

  IF _slug IS NULL OR _slug !~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$' THEN
    RAISE EXCEPTION 'invalid_store_slug';
  END IF;

  IF EXISTS (SELECT 1 FROM public.stores s WHERE s.owner_id = _uid) THEN
    RAISE EXCEPTION 'store_already_exists';
  END IF;

  INSERT INTO public.seller_legal_acceptances
    (user_id, privacy_policy_version, seller_terms_version, acceptance_language)
  VALUES (_uid, _privacy_version, _terms_version, _language)
  ON CONFLICT (user_id, privacy_policy_version, seller_terms_version) DO NOTHING;

  INSERT INTO public.stores (owner_id, name, slug, status)
  VALUES (_uid, trim(_name), _slug, 'active')
  RETURNING id INTO _store_id;

  RETURN _store_id;
END;
$$;

-- Store creation is intentionally available only through the validated RPC.
-- The SECURITY DEFINER RPC records consent and verifies the email before inserting.
DROP POLICY IF EXISTS "Verified users with current seller legal acceptance open store"
  ON public.stores;
REVOKE INSERT ON public.stores FROM authenticated;

CREATE OR REPLACE FUNCTION public.require_terms_acceptance_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _meta jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  IF _meta->>'accepted_terms' IS DISTINCT FROM 'true'
     OR _meta->>'terms_version' IS DISTINCT FROM '2026-11-04-v4'
     OR coalesce(_meta->>'terms_language', '') NOT IN ('fr', 'ar', 'en') THEN
    RAISE EXCEPTION 'terms_acceptance_required';
  END IF;
  RETURN NEW;
END;
$$;
