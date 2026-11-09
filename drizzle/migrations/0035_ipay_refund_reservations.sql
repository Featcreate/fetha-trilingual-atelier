-- Atomic iPay refund reservations.
-- The order row is the serialization lock: concurrent requests for one order
-- cannot both reserve against the same previously-refunded total.
-- This migration creates no provider calls and posts no ledger entries.

CREATE TABLE public.ipay_refund_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  refund_request_id uuid NOT NULL,
  amount_millimes bigint NOT NULL CHECK (amount_millimes > 0),
  idempotency_key text NOT NULL UNIQUE
    CHECK (length(trim(idempotency_key)) BETWEEN 8 AND 200),
  state text NOT NULL DEFAULT 'requested'
    CHECK (state IN ('requested','approved','processing','succeeded','failed','cancelled')),
  provider_refund_ref text,
  manual_evidence_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, refund_request_id),
  CONSTRAINT ipay_refund_success_has_evidence CHECK (
    state <> 'succeeded'
    OR nullif(trim(provider_refund_ref), '') IS NOT NULL
    OR nullif(trim(manual_evidence_ref), '') IS NOT NULL
  )
);

CREATE INDEX ipay_refund_reservations_order_state_idx
  ON public.ipay_refund_reservations(order_id, state);

CREATE UNIQUE INDEX ipay_refund_provider_reference_unique
  ON public.ipay_refund_reservations(provider_refund_ref)
  WHERE provider_refund_ref IS NOT NULL;

CREATE UNIQUE INDEX ipay_refund_manual_evidence_unique
  ON public.ipay_refund_reservations(manual_evidence_ref)
  WHERE manual_evidence_ref IS NOT NULL;

ALTER TABLE public.ipay_refund_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ipay_refund_reservations FROM PUBLIC, anon, authenticated;
-- No direct table privileges are granted; service_role uses the guarded SECURITY DEFINER RPCs only.

-- Reserve the requested amount while holding the parent order row lock.
-- Active/failed reservations remain counted until explicitly cancelled;
-- this prevents a failed-but-not-yet-reconciled provider request from being
-- accidentally refunded again through a second instruction.
CREATE OR REPLACE FUNCTION public.reserve_ipay_refund(
  _order_id uuid,
  _refund_request_id uuid,
  _amount_millimes bigint,
  _idempotency_key text
)
RETURNS TABLE (
  refund_id uuid,
  refund_state text,
  reserved_total_millimes bigint,
  remaining_refundable_millimes bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _paid_amount bigint;
  _reserved_amount bigint;
  _existing public.ipay_refund_reservations%ROWTYPE;
  _new_id uuid;
BEGIN
  IF _order_id IS NULL OR _refund_request_id IS NULL
     OR _amount_millimes IS NULL OR _amount_millimes <= 0
     OR _idempotency_key IS NULL
     OR length(trim(_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'invalid_ipay_refund_reservation';
  END IF;

  SELECT o.total_millimes
    INTO _paid_amount
  FROM public.orders o
  WHERE o.id = _order_id
    AND o.status = 'paid'
    AND o.payment_mode = 'verified'
    AND o.currency = 'TND'
    AND o.ipay_payment_ref IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ipay_refund_requires_verified_paid_order';
  END IF;

  SELECT r.*
    INTO _existing
  FROM public.ipay_refund_reservations r
  WHERE r.idempotency_key = trim(_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF _existing.order_id <> _order_id
       OR _existing.refund_request_id <> _refund_request_id
       OR _existing.amount_millimes <> _amount_millimes THEN
      RAISE EXCEPTION 'ipay_refund_idempotency_conflict';
    END IF;

    SELECT coalesce(sum(r.amount_millimes), 0)
      INTO _reserved_amount
    FROM public.ipay_refund_reservations r
    WHERE r.order_id = _order_id
      AND r.state <> 'cancelled';

    RETURN QUERY SELECT
      _existing.id,
      _existing.state,
      _reserved_amount,
      _paid_amount - _reserved_amount;
    RETURN;
  END IF;

  -- The request ID is also immutable: a caller cannot reuse it with a new key.
  SELECT r.*
    INTO _existing
  FROM public.ipay_refund_reservations r
  WHERE r.order_id = _order_id
    AND r.refund_request_id = _refund_request_id
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'ipay_refund_request_id_conflict';
  END IF;

  SELECT coalesce(sum(r.amount_millimes), 0)
    INTO _reserved_amount
  FROM public.ipay_refund_reservations r
  WHERE r.order_id = _order_id
    AND r.state <> 'cancelled';

  IF _amount_millimes > _paid_amount - _reserved_amount THEN
    RAISE EXCEPTION 'ipay_refund_exceeds_remaining_paid_amount';
  END IF;

  INSERT INTO public.ipay_refund_reservations (
    order_id, refund_request_id, amount_millimes, idempotency_key
  ) VALUES (
    _order_id, _refund_request_id, _amount_millimes, trim(_idempotency_key)
  )
  RETURNING id INTO _new_id;

  _reserved_amount := _reserved_amount + _amount_millimes;

  RETURN QUERY SELECT
    _new_id,
    'requested'::text,
    _reserved_amount,
    _paid_amount - _reserved_amount;
END;
$$;

-- Advance a reservation using a guarded state machine. The same order lock is
-- used for every transition, keeping reservation totals serializable per order.
CREATE OR REPLACE FUNCTION public.transition_ipay_refund(
  _refund_id uuid,
  _next_state text,
  _provider_refund_ref text DEFAULT NULL,
  _manual_evidence_ref text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _order_id uuid;
  _current public.ipay_refund_reservations%ROWTYPE;
BEGIN
  IF _refund_id IS NULL OR _next_state IS NULL OR _next_state NOT IN (
    'requested','approved','processing','succeeded','failed','cancelled'
  ) THEN
    RAISE EXCEPTION 'invalid_ipay_refund_transition';
  END IF;

  SELECT r.order_id INTO _order_id
  FROM public.ipay_refund_reservations r
  WHERE r.id = _refund_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ipay_refund_not_found';
  END IF;

  PERFORM 1
  FROM public.orders o
  WHERE o.id = _order_id
  FOR UPDATE;

  SELECT r.* INTO _current
  FROM public.ipay_refund_reservations r
  WHERE r.id = _refund_id
  FOR UPDATE;

  IF _current.state = _next_state THEN
    IF _next_state = 'succeeded'
       AND (
         _current.provider_refund_ref IS DISTINCT FROM nullif(trim(_provider_refund_ref), '')
         OR _current.manual_evidence_ref IS DISTINCT FROM nullif(trim(_manual_evidence_ref), '')
       ) THEN
      RAISE EXCEPTION 'ipay_refund_completion_reference_conflict';
    END IF;
    RETURN _current.state;
  END IF;

  IF NOT (
    (_current.state = 'requested' AND _next_state IN ('approved','cancelled'))
    OR (_current.state = 'approved' AND _next_state IN ('processing','cancelled'))
    OR (_current.state = 'processing' AND _next_state IN ('succeeded','failed'))
    OR (_current.state = 'failed' AND _next_state IN ('processing','cancelled'))
  ) THEN
    RAISE EXCEPTION 'ipay_refund_transition_not_allowed';
  END IF;

  IF _next_state = 'succeeded'
     AND nullif(trim(_provider_refund_ref), '') IS NULL
     AND nullif(trim(_manual_evidence_ref), '') IS NULL THEN
    RAISE EXCEPTION 'ipay_refund_completion_evidence_required';
  END IF;

  UPDATE public.ipay_refund_reservations
  SET state = _next_state,
      provider_refund_ref = coalesce(nullif(trim(_provider_refund_ref), ''), provider_refund_ref),
      manual_evidence_ref = coalesce(nullif(trim(_manual_evidence_ref), ''), manual_evidence_ref),
      updated_at = now()
  WHERE id = _refund_id;

  RETURN _next_state;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ipay_refund(uuid,uuid,bigint,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_ipay_refund(uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ipay_refund(uuid,uuid,bigint,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_ipay_refund(uuid,text,text,text)
  TO service_role;

COMMENT ON TABLE public.ipay_refund_reservations IS
  'Service-role-only reservation ledger for iPay refunds. Per-order row locking serializes concurrent refund requests. This table records reservations only; it does not call iPay or post accounting ledger entries.';
