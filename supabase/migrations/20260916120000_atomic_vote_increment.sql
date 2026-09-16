-- ABCOSSA: Atomic vote crediting to prevent inflated/lost votes
-- This migration fixes critical vote-counting bugs:
--   1. Non-atomic read-modify-write on votes_count (TOCTOU race condition)
--   2. No idempotency guard — webhook + client verify both credit votes
--   3. Missing is_votes_credited flag on payments table

-- 1. Add is_votes_credited column to payments table
-- This flag is set atomically with the RPC call to prevent double-crediting
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS is_votes_credited boolean not null default false;

-- 2. Create atomic vote increment function
-- Uses SQL-level atomic increment (no read-modify-write race)
-- Returns the new vote count, or NULL if the payment was already credited
CREATE OR REPLACE FUNCTION public.credit_votes_atomic(
  p_payment_id uuid,
  p_nominee_id uuid,
  p_votes_count integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count integer;
BEGIN
  -- Atomically mark the payment as votes-credited (only succeeds once due to unique constraint logic)
  -- If already credited, this returns 0 rows updated
  UPDATE public.payments
  SET is_votes_credited = true, updated_at = now()
  WHERE id = p_payment_id
    AND is_votes_credited = false;

  -- If no rows were updated, votes were already credited — return NULL to signal caller
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Atomically increment votes_count on the nominee (no read-modify-write)
  UPDATE public.nominees
  SET votes_count = votes_count + p_votes_count
  WHERE id = p_nominee_id
  RETURNING votes_count INTO new_count;

  RETURN new_count;
END;
$$;

-- 3. Create atomic vote deduction function (for reversing votes on status changes)
CREATE OR REPLACE FUNCTION public.deduct_votes_atomic(
  p_payment_id uuid,
  p_nominee_id uuid,
  p_votes_count integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count integer;
BEGIN
  -- Atomically unmark the payment as votes-credited
  UPDATE public.payments
  SET is_votes_credited = false, updated_at = now()
  WHERE id = p_payment_id
    AND is_votes_credited = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Atomically decrement votes_count (floor at 0)
  UPDATE public.nominees
  SET votes_count = GREATEST(0, votes_count - p_votes_count)
  WHERE id = p_nominee_id
  RETURNING votes_count INTO new_count;

  RETURN new_count;
END;
$$;

-- 4. Grant execute permissions to anon and authenticated roles
-- Edge functions use service_role, client uses anon/authenticated
GRANT EXECUTE ON FUNCTION public.credit_votes_atomic(uuid, uuid, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deduct_votes_atomic(uuid, uuid, integer) TO anon, authenticated, service_role;

-- 5. Backfill: Mark existing paid voting payments as already credited
-- This prevents double-counting during the transition period
UPDATE public.payments
SET is_votes_credited = true
WHERE status = 'paid'
  AND payment_type = 'voting'
  AND metadata->>'nominee_id' IS NOT NULL
  AND is_votes_credited = false;

-- 6. Create index for fast lookups during webhook/verify processing
CREATE INDEX IF NOT EXISTS idx_payments_client_reference ON public.payments(client_reference);
CREATE INDEX IF NOT EXISTS idx_payments_is_votes_credited ON public.payments(is_votes_credited) WHERE is_votes_credited = false;
