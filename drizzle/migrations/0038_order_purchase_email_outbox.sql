-- Durable, idempotent delivery queue for purchase-access emails.
-- No email provider is selected or called by this migration.
CREATE TABLE public.order_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
  recipient_email text NOT NULL CHECK (length(trim(recipient_email)) BETWEEN 3 AND 320),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','sent','failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX order_email_outbox_ready_idx
  ON public.order_email_outbox(next_attempt_at, created_at)
  WHERE status IN ('pending','failed');
ALTER TABLE public.order_email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_email_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.order_email_outbox TO authenticated;
GRANT ALL ON TABLE public.order_email_outbox TO service_role;
CREATE POLICY "Admins read order email delivery status"
  ON public.order_email_outbox FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));

CREATE OR REPLACE FUNCTION public.enqueue_order_purchase_email()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'paid'
     AND NEW.status = 'paid'
     AND NEW.payment_mode = 'verified' THEN
    IF NEW.customer_email IS NULL OR length(trim(NEW.customer_email)) < 3 THEN
      UPDATE public.orders
         SET email_error = 'missing_customer_email'
       WHERE id = NEW.id;
    ELSE
      INSERT INTO public.order_email_outbox (order_id, recipient_email)
      VALUES (NEW.id, lower(trim(NEW.customer_email)))
      ON CONFLICT (order_id) DO NOTHING;
      -- The outbox row is the delivery status; keep email_error reserved for failures.
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_order_purchase_email() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER orders_enqueue_purchase_email
  AFTER UPDATE OF status, payment_mode ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_order_purchase_email();

CREATE OR REPLACE FUNCTION public.claim_order_purchase_emails(_batch_size integer DEFAULT 10)
RETURNS TABLE (id uuid, order_id uuid, recipient_email text, attempt_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _batch_size < 1 OR _batch_size > 50 THEN
    RAISE EXCEPTION 'invalid_batch_size';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT q.id
      FROM public.order_email_outbox q
     WHERE (
       q.status IN ('pending','failed') AND q.next_attempt_at <= now()
     ) OR (
       q.status = 'sending' AND q.locked_at < now() - interval '10 minutes'
     )
     ORDER BY q.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT _batch_size
  )
  UPDATE public.order_email_outbox q
     SET status = 'sending',
         locked_at = now(),
         attempt_count = q.attempt_count + 1,
         last_error = NULL
    FROM candidates c
   WHERE q.id = c.id
  RETURNING q.id, q.order_id, q.recipient_email, q.attempt_count;
END $$;

CREATE OR REPLACE FUNCTION public.complete_order_purchase_email(_outbox_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _order_id uuid;
BEGIN
  UPDATE public.order_email_outbox
     SET status = 'sent', sent_at = now(), locked_at = NULL,
         last_error = NULL
   WHERE id = _outbox_id AND status = 'sending'
  RETURNING order_id INTO _order_id;
  IF _order_id IS NULL THEN RETURN false; END IF;
  UPDATE public.orders
     SET email_sent_at = now(), email_error = NULL
   WHERE id = _order_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.fail_order_purchase_email(_outbox_id uuid, _error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _order_id uuid;
BEGIN
  UPDATE public.order_email_outbox
     SET status = 'failed',
         locked_at = NULL,
         last_error = left(coalesce(nullif(trim(_error), ''), 'email_delivery_failed'), 500),
         next_attempt_at = now() + make_interval(mins => least(1440, greatest(1, power(2, least(attempt_count, 10))::integer)))
   WHERE id = _outbox_id AND status = 'sending'
  RETURNING order_id INTO _order_id;
  IF _order_id IS NULL THEN RETURN false; END IF;
  UPDATE public.orders
     SET email_error = 'email_delivery_failed'
   WHERE id = _order_id AND email_sent_at IS NULL;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.claim_order_purchase_emails(integer),
  public.complete_order_purchase_email(uuid),
  public.fail_order_purchase_email(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_purchase_emails(integer),
  public.complete_order_purchase_email(uuid),
  public.fail_order_purchase_email(uuid, text)
  TO service_role;
