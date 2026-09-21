-- ============================================================
-- CLOSE VOTING TOGGLE — 2026-09-20
-- ============================================================
-- Purpose: Let the organizer close voting entirely. When closed:
--   * Paid vote crediting is rejected at the database level
--     (credit_votes_atomic raises an exception) — covers the
--     Paystack webhook, paystack-verify, and all USSD flows,
--     so closed voting cannot be bypassed by crafting requests.
--   * Free (anon) updates to nominees are blocked by RLS.
--   * The public page shows "Voting Closed" and disables voting.
--
-- Admin deduction/correction flows (deduct_votes_atomic) remain
-- allowed so organizers can still reverse mistaken payments.
--
-- Does NOT touch existing vote tallies or payment records.
-- ============================================================

-- STEP 1: Seed the setting (default: voting open)
INSERT INTO public.site_settings (key, value)
VALUES ('voting_closed', 'false')
ON CONFLICT (key) DO NOTHING;

-- STEP 2: Allow anon to read the new setting on the public page
DROP POLICY IF EXISTS "anon_read_safe_settings" ON public.site_settings;

CREATE POLICY "anon_read_safe_settings"
  ON public.site_settings FOR SELECT
  TO anon
  USING (
    key IN (
      'vote_price_ghs',
      'ussd_shortcode',
      'ussd_event_code',
      'ussd_enabled',
      'ussd_provider',
      'ussd_instructions',
      'contact_email',
      'dinner_awards_2026_seed',
      'votes_hidden',
      'voting_closed',
      'bulk_voting_packages',
      'bulk_voting_enabled',
      'bulk_voting_start',
      'bulk_voting_end'
    )
  );

-- STEP 3: Helper used by RLS + crediting gate (definer so it can
-- read site_settings regardless of caller)
CREATE OR REPLACE FUNCTION public.is_voting_closed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value = 'true' FROM public.site_settings WHERE key = 'voting_closed'),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_voting_closed() TO anon, authenticated, service_role;

-- STEP 4: Gate paid vote crediting at the database level.
-- All payment paths (webhook, verify, USSD, client verify) call
-- this function, so closing voting blocks every crediting path.
CREATE OR REPLACE FUNCTION public.credit_votes_atomic(p_payment_id uuid, p_nominee_id uuid, p_votes_count integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  new_count integer;
BEGIN
  -- Organizer lock: reject crediting once voting is closed
  IF public.is_voting_closed() THEN
    RAISE EXCEPTION 'VOTING_CLOSED: voting has been closed by the organizer';
  END IF;

  -- Atomically mark the payment as votes-credited (only succeeds once)
  UPDATE public.payments
  SET is_votes_credited = true, updated_at = now()
  WHERE id = p_payment_id
    AND is_votes_credited = false;

  -- If no rows were updated, votes were already credited — return NULL
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
$function$;

-- STEP 5: Gate free votes at the RLS level.
-- Replaces the wide-open nominees_write_all policy:
--   * editors (authenticated) keep full CRUD
--   * anon keeps ONLY update (free voting), blocked while closed
--   * anon loses insert/delete on nominees (was never needed;
--     nominee creation is an admin-portal action)
DROP POLICY IF EXISTS "nominees_write_all" ON public.nominees;

CREATE POLICY "editor_write_nominees"
  ON public.nominees FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_update_nominees"
  ON public.nominees FOR UPDATE
  TO anon
  USING (public.is_voting_closed() = false)
  WITH CHECK (public.is_voting_closed() = false);

-- ============================================================
-- DONE — reopening voting (voting_closed = 'false') instantly
-- restores all paths. No vote data was modified.
-- ============================================================
