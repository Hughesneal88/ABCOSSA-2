-- ============================================================
-- VOTES VISIBILITY TOGGLE — 2026-09-20
-- ============================================================
-- Purpose: Let the organizer hide exact vote counts from the
-- public nominees page so nominees cannot see how many votes
-- each candidate has.
--
-- IMPORTANT: This migration does NOT touch:
--   * nominees.votes_count (no resets, no recalculations)
--   * payments / is_votes_credited
--   * credit_votes_atomic() / deduct_votes_atomic()
--   * any RLS policy on nominees or payments
--
-- What it does:
--   1. Seeds a single site_settings key: votes_hidden = 'false'
--      (votes stay visible until the organizer turns it off)
--   2. Recreates the anon-readable safe settings policy to
--      include the new key, plus the missing bulk_voting_*
--      keys (they were accidentally omitted from the safe
--      list in 20260917120000, which blocked the public page
--      from reading bulk package config)
-- ============================================================

-- STEP 1: Seed the visibility setting (default: visible)
INSERT INTO public.site_settings (key, value)
VALUES ('votes_hidden', 'false')
ON CONFLICT (key) DO NOTHING;

-- STEP 2: Refresh the anon-readable safe settings list
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
      'bulk_voting_packages',
      'bulk_voting_enabled',
      'bulk_voting_start',
      'bulk_voting_end'
    )
  );

-- ============================================================
-- DONE — no other changes. Editors (authenticated) can already
-- read/update site_settings via existing policies.
-- ============================================================
