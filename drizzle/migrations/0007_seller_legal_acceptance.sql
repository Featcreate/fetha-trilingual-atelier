-- Record explicit seller acceptance and make it a database prerequisite for store creation.
-- Additive only: no existing business, order, payment, or user data is removed.
CREATE TABLE public.seller_legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  privacy_policy_version text NOT NULL CHECK (length(privacy_policy_version) BETWEEN 1 AND 80),
  seller_terms_version text NOT NULL CHECK (length(seller_terms_version) BETWEEN 1 AND 80),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, privacy_policy_version, seller_terms_version)
);

ALTER TABLE public.seller_legal_acceptances ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.seller_legal_acceptances TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.seller_legal_acceptances FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.seller_legal_acceptances TO service_role;

CREATE POLICY "Sellers read own legal acceptances" ON public.seller_legal_acceptances
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.seller_legal_acceptances_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'seller_legal_acceptance_immutable';
END;
$$;
CREATE TRIGGER seller_legal_acceptances_immutable
  BEFORE UPDATE OR DELETE ON public.seller_legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.seller_legal_acceptances_guard();

-- Direct table inserts cannot bypass the explicit, versioned acceptance flow.
DROP POLICY "Verified users open own active store" ON public.stores;
CREATE POLICY "Verified users with current legal acceptance open store" ON public.stores
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND status = 'active'
    AND (SELECT public.current_user_email_is_confirmed())
    AND EXISTS (
      SELECT 1 FROM public.seller_legal_acceptances a
      WHERE a.user_id = (SELECT auth.uid())
        AND a.privacy_policy_version = '2026-10-31-v1'
        AND a.seller_terms_version = '2026-10-31-v1'
    )
  );

CREATE OR REPLACE FUNCTION public.create_seller_store(
  _name text,
  _slug text,
  _privacy_version text,
  _terms_version text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _store_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.current_user_email_is_confirmed() THEN RAISE EXCEPTION 'email_not_confirmed'; END IF;
  IF _privacy_version IS DISTINCT FROM '2026-10-31-v1'
     OR _terms_version IS DISTINCT FROM '2026-10-31-v1' THEN
    RAISE EXCEPTION 'legal_documents_outdated';
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
    (user_id, privacy_policy_version, seller_terms_version)
  VALUES (_uid, _privacy_version, _terms_version)
  ON CONFLICT (user_id, privacy_policy_version, seller_terms_version) DO NOTHING;

  INSERT INTO public.stores (owner_id, name, slug, status)
  VALUES (_uid, trim(_name), _slug, 'active')
  RETURNING id INTO _store_id;

  RETURN _store_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_seller_store(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_seller_store(text, text, text, text) TO authenticated, service_role;
