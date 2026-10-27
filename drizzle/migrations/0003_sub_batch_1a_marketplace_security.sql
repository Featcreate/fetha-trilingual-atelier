-- Pre-flight guard: abort if expected empty/legacy state changed.
DO $$ BEGIN
  IF (SELECT count(*) FROM public.products) > 0 OR (SELECT count(*) FROM public.product_files) > 0
     OR (SELECT count(*) FROM public.orders) > 0 THEN
    RAISE EXCEPTION 'preflight_failed: catalogue or orders not empty';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE confrelid = 'public.product_files'::regclass) THEN
    RAISE EXCEPTION 'preflight_failed: product_files has dependents';
  END IF;
END $$;

-- ---------- Settings ----------
CREATE TABLE public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  commission_bps integer NOT NULL DEFAULT 500 CHECK (commission_bps BETWEEN 0 AND 10000),
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_settings (id) VALUES (true);
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in read settings" ON public.platform_settings FOR SELECT TO authenticated USING (true);

-- ---------- Stores ----------
CREATE TYPE public.store_status AS ENUM ('active', 'suspended');
CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  status public.store_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stores_owner_idx ON public.stores(owner_id);
GRANT SELECT ON public.stores TO anon;
GRANT SELECT, INSERT, UPDATE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads active stores" ON public.stores FOR SELECT TO anon, authenticated USING (status = 'active');
CREATE POLICY "Owners read own stores" ON public.stores FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Admins read stores" ON public.stores FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users open own active store" ON public.stores FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND status = 'active');
CREATE POLICY "Owners update own stores" ON public.stores FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Admins update stores" ON public.stores FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.stores_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _trusted boolean := auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin');
BEGIN
  IF NEW.owner_id <> OLD.owner_id THEN RAISE EXCEPTION 'store_owner_immutable'; END IF;
  IF NOT _trusted AND (NEW.status <> OLD.status OR NEW.slug <> OLD.slug) THEN
    RAISE EXCEPTION 'store_status_admin_only';
  END IF;
  IF NOT _trusted AND OLD.status = 'suspended' THEN RAISE EXCEPTION 'store_suspended'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER stores_guard BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.stores_guard();

-- ---------- Products: store ownership + visibility ----------
ALTER TABLE public.products ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE RESTRICT;
ALTER TABLE public.products ADD COLUMN product_type text NOT NULL DEFAULT 'other'
  CHECK (product_type IN ('ebook','template','printable','planner','course','software','audio','video','graphics','other'));
CREATE INDEX products_store_idx ON public.products(store_id);
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

DROP POLICY "Anyone reads active products" ON public.products;
CREATE POLICY "Anyone reads listed products" ON public.products FOR SELECT TO anon, authenticated
  USING (is_active AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.status = 'active'));
CREATE POLICY "Sellers read own products" ON public.products FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.owner_id = auth.uid()));
CREATE POLICY "Sellers add products to own active store" ON public.products FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.owner_id = auth.uid() AND s.status = 'active'));
CREATE POLICY "Sellers update own products" ON public.products FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.owner_id = auth.uid() AND s.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.owner_id = auth.uid() AND s.status = 'active'));

CREATE OR REPLACE FUNCTION public.products_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.store_id IS DISTINCT FROM OLD.store_id
     AND NOT (auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'product_store_immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.order_items WHERE product_id = OLD.id) THEN RAISE EXCEPTION 'product_has_orders'; END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER products_guard BEFORE UPDATE OR DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.products_guard();

-- ---------- Legacy single-file table: kept, retired ----------
COMMENT ON TABLE public.product_files IS 'DEPRECATED: replaced by product_file_versions (multi-file, immutable). Kept for compatibility; do not write.';

-- ---------- Immutable file versions ----------
CREATE TABLE public.product_file_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  file_name text NOT NULL CHECK (file_name ~ '^[A-Za-z0-9][A-Za-z0-9._ -]{0,199}$' AND file_name NOT LIKE '%..%'),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  mime_type text NOT NULL DEFAULT 'application/octet-stream' CHECK (length(mime_type) <= 200),
  sha256 text CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending_upload' CHECK (status IN ('pending_upload','active','archived')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  archived_at timestamptz
);
CREATE INDEX pfv_product_idx ON public.product_file_versions(product_id, status);
GRANT SELECT ON public.product_file_versions TO authenticated;
GRANT ALL ON public.product_file_versions TO service_role;
ALTER TABLE public.product_file_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers read own file versions" ON public.product_file_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_file_versions.store_id AND s.owner_id = auth.uid()));
CREATE POLICY "Admins read file versions" ON public.product_file_versions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.pfv_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'file_version_immutable'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.store_id = NEW.store_id) THEN
      RAISE EXCEPTION 'file_store_mismatch';
    END IF;
    NEW.status := 'pending_upload';
    NEW.storage_path := NEW.store_id || '/' || NEW.product_id || '/' || NEW.id || '/' || NEW.file_name;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.product_id, NEW.store_id, NEW.file_name, NEW.size_bytes, NEW.mime_type, NEW.sha256, NEW.storage_path, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.product_id, OLD.store_id, OLD.file_name, OLD.size_bytes, OLD.mime_type, OLD.sha256, OLD.storage_path, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'file_version_immutable';
  END IF;
  IF NEW.status <> OLD.status AND NOT ((OLD.status = 'pending_upload' AND NEW.status IN ('active','archived')) OR (OLD.status = 'active' AND NEW.status = 'archived')) THEN
    RAISE EXCEPTION 'invalid_file_status_transition';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pfv_guard BEFORE INSERT OR UPDATE OR DELETE ON public.product_file_versions FOR EACH ROW EXECUTE FUNCTION public.pfv_guard();

CREATE OR REPLACE FUNCTION public.register_file_version(_product_id uuid, _file_name text, _size_bytes bigint, _mime_type text, _sha256 text)
RETURNS TABLE (version_id uuid, upload_path text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE _store uuid; _id uuid; _path text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT p.store_id INTO _store FROM products p JOIN stores s ON s.id = p.store_id
   WHERE p.id = _product_id AND s.owner_id = auth.uid() AND s.status = 'active';
  IF _store IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO product_file_versions (product_id, store_id, file_name, size_bytes, mime_type, sha256, storage_path, created_by)
  VALUES (_product_id, _store, _file_name, _size_bytes, coalesce(nullif(_mime_type,''),'application/octet-stream'), nullif(lower(_sha256),''), 'pending', auth.uid())
  RETURNING id, storage_path INTO _id, _path;
  RETURN QUERY SELECT _id, _path;
END $$;

CREATE OR REPLACE FUNCTION public.activate_file_version(_version_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  SELECT pv.* INTO v FROM product_file_versions pv JOIN stores s ON s.id = pv.store_id
   WHERE pv.id = _version_id AND (s.owner_id = auth.uid() AND s.status = 'active' OR public.has_role(auth.uid(), 'admin'))
   FOR UPDATE OF pv;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v.status <> 'pending_upload' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'product-files' AND o.name = v.storage_path
                 AND (o.metadata->>'size')::bigint = v.size_bytes) THEN
    RAISE EXCEPTION 'upload_missing_or_size_mismatch';
  END IF;
  UPDATE product_file_versions SET status = 'active', activated_at = now() WHERE id = _version_id;
END $$;

CREATE OR REPLACE FUNCTION public.archive_file_version(_version_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE product_file_versions pv SET status = 'archived', archived_at = now()
   FROM stores s WHERE s.id = pv.store_id AND pv.id = _version_id AND pv.status <> 'archived'
   AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
END $$;

-- ---------- Storage: private, insert-only to registered paths ----------
DROP POLICY "Admins manage product files objects" ON storage.objects;
CREATE POLICY "Admins read product file objects" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-files' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Sellers upload registered file versions" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-files' AND EXISTS (
    SELECT 1 FROM public.product_file_versions v JOIN public.stores s ON s.id = v.store_id
    WHERE v.storage_path = storage.objects.name AND v.status = 'pending_upload'
      AND v.created_by = auth.uid() AND s.owner_id = auth.uid() AND s.status = 'active'));

-- ---------- Orders / items: snapshots, no cascading loss ----------
ALTER TABLE public.orders ADD COLUMN payment_mode text CHECK (payment_mode IN ('verified','simulation'));
ALTER TABLE public.orders ADD COLUMN payment_confirmation_ref text;
ALTER TABLE public.order_items DROP CONSTRAINT order_items_order_id_fkey;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;
ALTER TABLE public.order_items
  ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE RESTRICT,
  ADD COLUMN seller_id uuid,
  ADD COLUMN quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  ADD COLUMN gross_millimes integer CHECK (gross_millimes >= 0),
  ADD COLUMN discount_millimes integer NOT NULL DEFAULT 0 CHECK (discount_millimes >= 0),
  ADD COLUMN payable_millimes integer,
  ADD COLUMN commission_bps integer CHECK (commission_bps BETWEEN 0 AND 10000),
  ADD COLUMN commission_millimes integer CHECK (commission_millimes >= 0),
  ADD COLUMN seller_net_millimes integer CHECK (seller_net_millimes >= 0);
ALTER TABLE public.order_items ADD CONSTRAINT order_items_money_reconciles CHECK (
  gross_millimes IS NULL OR (
    gross_millimes = unit_price_millimes * quantity
    AND discount_millimes <= gross_millimes
    AND payable_millimes = gross_millimes - discount_millimes
    AND commission_millimes + seller_net_millimes = payable_millimes));

CREATE OR REPLACE FUNCTION public.forbid_change() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION '%_immutable', TG_TABLE_NAME; END $$;
CREATE TRIGGER order_items_immutable BEFORE UPDATE OR DELETE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.forbid_change();
CREATE OR REPLACE FUNCTION public.orders_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'orders_immutable'; END IF;
  IF NEW.total_millimes <> OLD.total_millimes OR NEW.user_id <> OLD.user_id THEN RAISE EXCEPTION 'orders_immutable'; END IF;
  IF OLD.status = 'paid' AND NEW.status <> 'paid' THEN RAISE EXCEPTION 'paid_order_locked'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_guard BEFORE UPDATE OR DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_guard();

CREATE TABLE public.order_item_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  file_version_id uuid NOT NULL REFERENCES public.product_file_versions(id) ON DELETE RESTRICT,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  size_bytes bigint NOT NULL,
  UNIQUE (order_item_id, file_version_id)
);
CREATE TRIGGER order_item_files_immutable BEFORE UPDATE OR DELETE ON public.order_item_files FOR EACH ROW EXECUTE FUNCTION public.forbid_change();
GRANT SELECT ON public.order_item_files TO authenticated;
GRANT ALL ON public.order_item_files TO service_role;
ALTER TABLE public.order_item_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyers read own purchased files" ON public.order_item_files FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.order_items i JOIN public.orders o ON o.id = i.order_id WHERE i.id = order_item_files.order_item_id AND o.user_id = auth.uid()));
CREATE POLICY "Admins read purchased files" ON public.order_item_files FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------- Entitlements, reservations, renewals ----------
CREATE TABLE public.download_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_file_id uuid NOT NULL UNIQUE REFERENCES public.order_item_files(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  max_downloads integer NOT NULL DEFAULT 3 CHECK (max_downloads BETWEEN 0 AND 100),
  used_downloads integer NOT NULL DEFAULT 0 CHECK (used_downloads >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (used_downloads <= max_downloads), CHECK (expires_at > starts_at)
);
CREATE INDEX de_user_idx ON public.download_entitlements(user_id);
GRANT SELECT ON public.download_entitlements TO authenticated;
GRANT ALL ON public.download_entitlements TO service_role;
ALTER TABLE public.download_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyers read own entitlements" ON public.download_entitlements FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins read entitlements" ON public.download_entitlements FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.download_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES public.download_entitlements(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','finalized','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  closed_at timestamptz
);
CREATE UNIQUE INDEX dr_one_pending ON public.download_reservations(entitlement_id) WHERE status = 'pending';
GRANT ALL ON public.download_reservations TO service_role;
GRANT SELECT ON public.download_reservations TO authenticated;
ALTER TABLE public.download_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read reservations" ON public.download_reservations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.entitlement_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES public.download_entitlements(id) ON DELETE RESTRICT,
  admin_id uuid NOT NULL,
  extra_days integer NOT NULL CHECK (extra_days BETWEEN 0 AND 365),
  extra_downloads integer NOT NULL CHECK (extra_downloads BETWEEN 0 AND 20),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.entitlement_renewals TO authenticated;
GRANT ALL ON public.entitlement_renewals TO service_role;
ALTER TABLE public.entitlement_renewals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read renewals" ON public.entitlement_renewals FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------- Ledger & cleanup audit ----------
CREATE TABLE public.seller_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('sale_net')),
  amount_millimes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_item_id, entry_type)
);
CREATE TRIGGER ledger_immutable BEFORE UPDATE OR DELETE ON public.seller_ledger_entries FOR EACH ROW EXECUTE FUNCTION public.forbid_change();
GRANT SELECT ON public.seller_ledger_entries TO authenticated;
GRANT ALL ON public.seller_ledger_entries TO service_role;
ALTER TABLE public.seller_ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers read own ledger" ON public.seller_ledger_entries FOR SELECT TO authenticated USING (seller_id = auth.uid());
CREATE POLICY "Admins read ledger" ON public.seller_ledger_entries FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.storage_cleanup_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_version_id uuid REFERENCES public.product_file_versions(id) ON DELETE RESTRICT,
  storage_path text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('dry_run_eligible','retained','deleted')),
  reason text NOT NULL,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER cleanup_audit_immutable BEFORE UPDATE OR DELETE ON public.storage_cleanup_audit FOR EACH ROW EXECUTE FUNCTION public.forbid_change();
GRANT SELECT ON public.storage_cleanup_audit TO authenticated;
GRANT ALL ON public.storage_cleanup_audit TO service_role;
ALTER TABLE public.storage_cleanup_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read cleanup audit" ON public.storage_cleanup_audit FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.payment_events ADD COLUMN payment_mode text CHECK (payment_mode IN ('verified','simulation'));

-- ---------- Order creation with server prices + snapshots ----------
CREATE OR REPLACE FUNCTION public.create_order(_product_ids uuid[], _checkout_key text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _existing uuid; _order uuid; _count int; _found int; _total bigint; _bps int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _checkout_key IS NULL OR length(_checkout_key) < 8 OR length(_checkout_key) > 100 THEN RAISE EXCEPTION 'invalid_checkout_key'; END IF;
  SELECT id INTO _existing FROM orders WHERE user_id = _uid AND checkout_key = _checkout_key;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;
  SELECT count(DISTINCT x) INTO _count FROM unnest(_product_ids) x;
  IF _count = 0 OR _count > 50 THEN RAISE EXCEPTION 'invalid_cart'; END IF;
  SELECT count(*), coalesce(sum(p.price_millimes), 0) INTO _found, _total
    FROM products p JOIN stores s ON s.id = p.store_id
   WHERE p.id = ANY(_product_ids) AND p.is_active AND s.status = 'active'
     AND EXISTS (SELECT 1 FROM product_file_versions v WHERE v.product_id = p.id AND v.status = 'active');
  IF _found <> _count THEN RAISE EXCEPTION 'product_unavailable'; END IF;
  IF _total > 2000000000 THEN RAISE EXCEPTION 'invalid_cart'; END IF;
  SELECT commission_bps INTO _bps FROM platform_settings WHERE id;

  INSERT INTO orders (user_id, customer_email, total_millimes, checkout_key)
  VALUES (_uid, (SELECT email FROM auth.users WHERE id = _uid), _total, _checkout_key) RETURNING id INTO _order;

  INSERT INTO order_items (order_id, product_id, product_name, unit_price_millimes, store_id, seller_id, quantity,
    gross_millimes, discount_millimes, payable_millimes, commission_bps, commission_millimes, seller_net_millimes)
  SELECT _order, p.id, p.name, p.price_millimes, s.id, s.owner_id, 1, c.gross, 0, c.gross, _bps, c.comm, c.gross - c.comm
    FROM products p JOIN stores s ON s.id = p.store_id
    CROSS JOIN LATERAL (SELECT p.price_millimes AS gross,
      round(p.price_millimes::numeric * _bps / 10000)::int AS comm) c
   WHERE p.id = ANY(_product_ids);

  INSERT INTO order_item_files (order_item_id, file_version_id, storage_path, file_name, size_bytes)
  SELECT i.id, v.id, v.storage_path, v.file_name, v.size_bytes
    FROM order_items i JOIN product_file_versions v ON v.product_id = i.product_id AND v.status = 'active'
   WHERE i.order_id = _order;

  IF (SELECT sum(payable_millimes) FROM order_items WHERE order_id = _order) <> _total THEN RAISE EXCEPTION 'total_mismatch'; END IF;
  RETURN _order;
END $$;

-- ---------- Single trusted settlement ----------
CREATE OR REPLACE FUNCTION public.settle_order_payment(_order_id uuid, _mode text, _payment_ref text, _amount_millimes integer, _source text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; _now timestamptz := now();
BEGIN
  IF _mode NOT IN ('verified','simulation') THEN RAISE EXCEPTION 'invalid_mode'; END IF;
  SELECT * INTO o FROM orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unknown_order'; END IF;
  IF o.status = 'paid' THEN
    INSERT INTO payment_events (order_id, payment_ref, source, outcome, payment_mode) VALUES (o.id, _payment_ref, _source, 'already_paid', _mode);
    RETURN 'already_paid';
  END IF;
  IF o.status <> 'pending' THEN RETURN 'order_closed'; END IF;
  IF _amount_millimes IS DISTINCT FROM o.total_millimes THEN
    INSERT INTO payment_events (order_id, payment_ref, source, outcome, payment_mode) VALUES (o.id, _payment_ref, _source, 'mismatch', _mode);
    RETURN 'mismatch';
  END IF;
  UPDATE orders SET status = 'paid', paid_at = _now, payment_mode = _mode, payment_confirmation_ref = _payment_ref WHERE id = o.id;
  INSERT INTO download_entitlements (order_id, order_item_file_id, user_id, starts_at, expires_at)
  SELECT o.id, f.id, o.user_id, _now, _now + interval '7 days'
    FROM order_item_files f JOIN order_items i ON i.id = f.order_item_id WHERE i.order_id = o.id
  ON CONFLICT (order_item_file_id) DO NOTHING;
  IF _mode = 'verified' THEN
    INSERT INTO seller_ledger_entries (order_item_id, store_id, seller_id, entry_type, amount_millimes)
    SELECT i.id, i.store_id, i.seller_id, 'sale_net', i.seller_net_millimes FROM order_items i WHERE i.order_id = o.id
    ON CONFLICT (order_item_id, entry_type) DO NOTHING;
  END IF;
  INSERT INTO payment_events (order_id, payment_ref, source, outcome, payment_mode) VALUES (o.id, _payment_ref, _source, 'paid', _mode);
  RETURN 'paid';
END $$;

-- ---------- Downloads: reserve / finalize / release ----------
CREATE OR REPLACE FUNCTION public.reserve_download(_user_id uuid, _entitlement_id uuid)
RETURNS TABLE (outcome text, reservation_id uuid, storage_path text, file_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE e record; _rid uuid;
BEGIN
  SELECT de.id, de.user_id, de.expires_at, de.used_downloads, de.max_downloads, o.status AS ostatus, o.user_id AS ouser,
         o.payment_mode AS pm, f.storage_path AS sp, f.file_name AS fn
    INTO e FROM download_entitlements de JOIN orders o ON o.id = de.order_id JOIN order_item_files f ON f.id = de.order_item_file_id
   WHERE de.id = _entitlement_id FOR UPDATE OF de;
  IF NOT FOUND OR e.user_id <> _user_id OR e.ouser <> _user_id THEN RETURN QUERY SELECT 'forbidden', NULL::uuid, NULL::text, NULL::text; RETURN; END IF;
  IF e.ostatus <> 'paid' OR e.pm IS NULL THEN RETURN QUERY SELECT 'not_paid', NULL::uuid, NULL::text, NULL::text; RETURN; END IF;
  IF e.expires_at <= now() THEN RETURN QUERY SELECT 'expired', NULL::uuid, NULL::text, NULL::text; RETURN; END IF;
  UPDATE download_reservations SET status = 'released', closed_at = now()
   WHERE entitlement_id = e.id AND status = 'pending' AND created_at < now() - interval '2 minutes';
  IF EXISTS (SELECT 1 FROM download_reservations WHERE entitlement_id = e.id AND status = 'pending') THEN
    RETURN QUERY SELECT 'busy', NULL::uuid, NULL::text, NULL::text; RETURN;
  END IF;
  SELECT r.id INTO _rid FROM download_reservations r
   WHERE r.entitlement_id = e.id AND r.status = 'finalized' AND r.finalized_at > now() - interval '5 minutes'
   ORDER BY r.finalized_at ASC LIMIT 1;
  IF _rid IS NOT NULL THEN RETURN QUERY SELECT 'dedupe', _rid, e.sp, e.fn; RETURN; END IF;
  IF e.used_downloads >= e.max_downloads THEN RETURN QUERY SELECT 'quota_exhausted', NULL::uuid, NULL::text, NULL::text; RETURN; END IF;
  INSERT INTO download_reservations (entitlement_id, user_id) VALUES (e.id, _user_id) RETURNING id INTO _rid;
  RETURN QUERY SELECT 'new', _rid, e.sp, e.fn;
END $$;

CREATE OR REPLACE FUNCTION public.finalize_download(_reservation_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ent uuid;
BEGIN
  SELECT entitlement_id INTO _ent FROM download_reservations WHERE id = _reservation_id;
  IF _ent IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM download_entitlements WHERE id = _ent AND expires_at > now() AND used_downloads < max_downloads FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE download_reservations SET status = 'released', closed_at = now() WHERE id = _reservation_id AND status = 'pending';
    RETURN false;
  END IF;
  UPDATE download_reservations SET status = 'finalized', finalized_at = now() WHERE id = _reservation_id AND status = 'pending';
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE download_entitlements SET used_downloads = used_downloads + 1 WHERE id = _ent;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.release_download(_reservation_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE download_reservations SET status = 'released', closed_at = now() WHERE id = _reservation_id AND status = 'pending';
$$;

-- ---------- Admin operations (audited) ----------
CREATE OR REPLACE FUNCTION public.admin_renew_entitlement(_entitlement_id uuid, _extra_days integer, _extra_downloads integer, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO entitlement_renewals (entitlement_id, admin_id, extra_days, extra_downloads, reason)
  VALUES (_entitlement_id, auth.uid(), _extra_days, _extra_downloads, _reason);
  UPDATE download_entitlements SET expires_at = greatest(expires_at, now()) + make_interval(days => _extra_days),
         max_downloads = max_downloads + _extra_downloads WHERE id = _entitlement_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_commission_bps(_bps integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE platform_settings SET commission_bps = _bps, updated_by = auth.uid(), updated_at = now() WHERE id;
END $$;

-- ---------- Function privileges (only the functions created/changed here) ----------
REVOKE ALL ON FUNCTION public.settle_order_payment(uuid, text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_download(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_download(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_download(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_order_payment(uuid, text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_download(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_download(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_download(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_order(uuid[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_file_version(uuid, text, bigint, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activate_file_version(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_file_version(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_renew_entitlement(uuid, integer, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_commission_bps(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(uuid[], text), public.register_file_version(uuid, text, bigint, text, text),
  public.activate_file_version(uuid), public.archive_file_version(uuid),
  public.admin_renew_entitlement(uuid, integer, integer, text), public.admin_set_commission_bps(integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.stores_guard(), public.products_guard() FROM PUBLIC, anon, authenticated;