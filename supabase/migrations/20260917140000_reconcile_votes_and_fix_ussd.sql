-- ============================================================
-- RECONCILE VOTES & FIX INFLATION — 2026-09-17
-- ============================================================
-- Root cause: USSD CONFIRM_VOTE increments votes IMMEDIATELY
-- before payment is verified. Failed/abandoned USSD attempts
-- leave phantom votes on nominees.
--
-- This migration:
--   1. Resets ALL nominee votes to 0
--   2. Recalculates from ONLY paid + credited payments
--   3. Creates a diagnostic view for ongoing monitoring
-- ============================================================

-- PART 1: DIAGNOSTIC — Show current inflation before fix
DO $$
DECLARE
  inflation_count INTEGER;
  total_expected INTEGER;
  total_actual INTEGER;
BEGIN
  -- Count expected votes (from paid + is_votes_credited payments only)
  SELECT COALESCE(SUM((metadata->>'votes_count')::integer), 0)
  INTO total_expected
  FROM payments
  WHERE status = 'paid'
    AND payment_type = 'voting'
    AND is_votes_credited = true
    AND metadata->>'nominee_id' IS NOT NULL;

  -- Count actual votes
  SELECT COALESCE(SUM(votes_count), 0)
  INTO total_actual
  FROM nominees;

  inflation_count := total_actual - total_expected;

  RAISE NOTICE '=== RECONCILE DIAGNOSTIC ===';
  RAISE NOTICE 'Expected votes (paid+credited): %', total_expected;
  RAISE NOTICE 'Actual votes (nominees table): %', total_actual;
  RAISE NOTICE 'Inflation to remove: %', inflation_count;
END $$;

-- PART 2: FIX — Reset all nominee votes to 0, then add protected
-- manual votes (organizer-granted outside the app) so they survive
-- reconciliation. manual_votes column added by 20260920220000.
UPDATE nominees SET votes_count = 0;
UPDATE nominees SET votes_count = votes_count + COALESCE(manual_votes, 0);

-- PART 3: REBUILD — Recalculate from ONLY paid + credited payments,
-- keeping manual votes on top. This is the single source of truth.
UPDATE nominees n
SET votes_count = COALESCE(n.manual_votes, 0) + COALESCE(sub.total_votes, 0)
FROM (
  SELECT
    (p.metadata->>'nominee_id')::uuid AS nominee_id,
    SUM(GREATEST(1, (p.metadata->>'votes_count')::integer)) AS total_votes
  FROM payments p
  WHERE p.status = 'paid'
    AND p.payment_type = 'voting'
    AND p.is_votes_credited = true
    AND p.metadata->>'nominee_id' IS NOT NULL
  GROUP BY p.metadata->>'nominee_id'
) sub
WHERE n.id = sub.nominee_id;

-- Nominees with manual votes but no paid votes at all
UPDATE nominees n
SET votes_count = COALESCE(n.manual_votes, 0)
WHERE NOT EXISTS (
  SELECT 1 FROM payments p
  WHERE p.status = 'paid'
    AND p.payment_type = 'voting'
    AND p.is_votes_credited = true
    AND p.metadata->>'nominee_id' = n.id::text
);

-- PART 4: Verify the fix
DO $$
DECLARE
  new_total INTEGER;
  paid_total INTEGER;
  manual_total INTEGER;
BEGIN
  SELECT COALESCE(SUM(votes_count), 0) INTO new_total FROM nominees;

  SELECT COALESCE(SUM((metadata->>'votes_count')::integer), 0)
  INTO paid_total
  FROM payments
  WHERE status = 'paid'
    AND payment_type = 'voting'
    AND is_votes_credited = true
    AND metadata->>'nominee_id' IS NOT NULL;

  SELECT COALESCE(SUM(manual_votes), 0) INTO manual_total FROM nominees;

  RAISE NOTICE '=== AFTER RECONCILE ===';
  RAISE NOTICE 'Nominee votes total: %', new_total;
  RAISE NOTICE 'Paid+credited votes total: %', paid_total;
  RAISE NOTICE 'Protected manual votes: %', manual_total;
  RAISE NOTICE 'Match: %', CASE WHEN new_total = paid_total + manual_total THEN 'YES' ELSE 'NO - INVESTIGATE' END;
END $$;

-- PART 5: Create a view for monitoring vote accuracy
CREATE OR REPLACE VIEW public.vote_accuracy_report AS
SELECT
  n.id AS nominee_id,
  n.name AS nominee_name,
  n.nominee_code,
  n.votes_count AS actual_votes,
  COALESCE(pv.paid_votes, 0) AS paid_votes,
  n.votes_count - COALESCE(pv.paid_votes, 0) AS discrepancy,
  CASE
    WHEN n.votes_count = COALESCE(pv.paid_votes, 0) THEN 'CORRECT'
    WHEN n.votes_count > COALESCE(pv.paid_votes, 0) THEN 'INFLATED'
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
ORDER BY ABS(n.votes_count - COALESCE(pv.paid_votes, 0)) DESC;

-- PART 6: Mark ALL paid voting payments as credited (backfill)
-- These are payments that were verified as paid but never had is_votes_credited set
UPDATE payments
SET is_votes_credited = true
WHERE status = 'paid'
  AND payment_type = 'voting'
  AND is_votes_credited = false
  AND metadata->>'nominee_id' IS NOT NULL;

-- ============================================================
-- DONE
-- ============================================================
