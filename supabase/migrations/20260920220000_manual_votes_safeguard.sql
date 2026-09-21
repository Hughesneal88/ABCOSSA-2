-- ============================================================
-- MANUAL VOTES SAFEGUARD — 2026-09-20
-- ============================================================
-- Purpose: Protect organizer-added manual votes (votes granted
-- outside the app, e.g. cash/mobile-money received in person)
-- from being wiped by any vote reconciliation.
--
-- How it works:
--   * nominees.manual_votes holds the protected tally.
--   * Reconciliation sets votes_count = manual_votes + paid votes
--     (instead of paid votes alone), so manual votes always survive.
--   * Admin can adjust manual_votes in the future; votes_count
--     keeps functioning exactly as before.
--
-- Backfill: the two manual grants made on 2026-09-20:
--   * nominee 140 (Prof Benjamin Ofori): +500
--   * nominee 172 (Samuel Duah):        1,050 total (all manual)
-- ============================================================

-- STEP 1: Add the protected tally column (0 for everyone by default)
ALTER TABLE public.nominees
  ADD COLUMN IF NOT EXISTS manual_votes integer NOT NULL DEFAULT 0;

-- STEP 2: Backfill the two known manual grants
UPDATE public.nominees
SET manual_votes = 500
WHERE nominee_code = '140'
  AND name = 'Prof Benjamin Ofori';

UPDATE public.nominees
SET manual_votes = 1050
WHERE nominee_code = '172'
  AND name = 'Samuel Duah';

-- STEP 3: Rebuild the diagnostic view so "expected" includes manual votes
CREATE OR REPLACE VIEW public.vote_accuracy_report AS
SELECT
  n.id AS nominee_id,
  n.name AS nominee_name,
  n.nominee_code,
  n.votes_count AS actual_votes,
  COALESCE(pv.paid_votes, 0) + n.manual_votes AS expected_votes,
  n.votes_count - (COALESCE(pv.paid_votes, 0) + n.manual_votes) AS discrepancy,
  CASE
    WHEN n.votes_count = COALESCE(pv.paid_votes, 0) + n.manual_votes THEN 'CORRECT'
    WHEN n.votes_count > COALESCE(pv.paid_votes, 0) + n.manual_votes THEN 'INFLATED'
    ELSE 'DEFICIT'
  END AS status
FROM nominees n
LEFT JOIN (
  SELECT
    (metadata->>'nominee_id')::uuid AS nominee_id,
    SUM(GREATEST(1, (metadata->>'votes_count')::integer)) AS paid_votes
  FROM payments
  WHERE status = 'paid'
    AND payment_type = 'voting'
    AND is_votes_credited = true
    AND metadata->>'nominee_id' IS NOT NULL
  GROUP BY metadata->>'nominee_id'
) pv ON pv.nominee_id = n.id
ORDER BY ABS(n.votes_count - (COALESCE(pv.paid_votes, 0) + n.manual_votes)) DESC;

-- ============================================================
-- DONE — the app-side recalculation (useRecalculateNomineeVotes)
-- is updated in the same commit to add manual_votes on top of
-- paid votes, so pressing "Recalculate Votes" can no longer
-- wipe manual grants.
-- ============================================================
