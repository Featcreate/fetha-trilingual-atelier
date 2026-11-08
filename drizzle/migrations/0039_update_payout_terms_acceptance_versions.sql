-- Synchronize database-enforced legal acceptance versions with the revised terms.
-- Seller terms v3 clarifies that receiving/withdrawal fees are not covered by
-- Algorea Bazaar and are not recorded, deducted, or shown in payout statements.
-- Public Terms v5 carries the same clarification.

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
     OR _terms_version IS DISTINCT FROM '2026-11-08-v3' THEN
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
     OR _meta->>'terms_version' IS DISTINCT FROM '2026-11-08-v5'
     OR coalesce(_meta->>'terms_language', '') NOT IN ('fr', 'ar', 'en') THEN
    RAISE EXCEPTION 'terms_acceptance_required';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.create_seller_store(text,text,text,text,text) IS
  'Creates a verified seller store only after acceptance of the current privacy policy and seller terms versions.';
COMMENT ON FUNCTION public.require_terms_acceptance_on_signup() IS
  'Requires acceptance of public Terms of Use version 2026-11-08-v5 at signup.';
