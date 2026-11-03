-- Require separate, versioned Privacy Policy and Seller Terms acceptance before store creation.
-- Additive and non-destructive. This migration is not applied to any live database by this change.

CREATE TABLE public.seller_legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  privacy_policy_version text NOT NULL CHECK (length(privacy_policy_version) BETWEEN 1 AND 80),
  seller_terms_version text NOT NULL CHECK (length(seller_terms_version) BETWEEN 1 AND 80),
  acceptance_language text NOT NULL CHECK (acceptance_language IN ('fr', 'ar', 'en')),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, privacy_policy_version, seller_terms_version)
);

ALTER TABLE public.seller_legal_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.seller_legal_acceptances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.seller_legal_acceptances TO authenticated;
GRANT ALL ON TABLE public.seller_legal_acceptances TO service_role;

CREATE POLICY "Sellers read own legal acceptances"
  ON public.seller_legal_acceptances FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Admins read seller legal acceptances"
  ON public.seller_legal_acceptances FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));

CREATE OR REPLACE FUNCTION public.prevent_seller_legal_acceptance_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'seller_legal_acceptance_immutable';
END;
$$;

CREATE TRIGGER seller_legal_acceptances_immutable
  BEFORE UPDATE ON public.seller_legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.prevent_seller_legal_acceptance_mutation();

-- A direct client INSERT cannot bypass the consent workflow.
DROP POLICY IF EXISTS "Verified users open own active store" ON public.stores;
CREATE POLICY "Verified users with current seller legal acceptance open store"
  ON public.stores FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND status = 'active'
    AND public.is_email_verified((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.seller_legal_acceptances a
      WHERE a.user_id = (SELECT auth.uid())
        AND a.privacy_policy_version = '2026-10-31-v1'
        AND a.seller_terms_version = '2026-10-31-v1'
    )
  );

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
     OR _terms_version IS DISTINCT FROM '2026-10-31-v1' THEN
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

REVOKE ALL ON FUNCTION public.create_seller_store(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_seller_store(text, text, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_seller_legal_acceptance_mutation() FROM PUBLIC, anon, authenticated;
