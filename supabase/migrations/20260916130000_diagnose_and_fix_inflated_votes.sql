-- ABCOSSA: Diagnose and Fix Inflated/Lost Votes
-- =====================================================
-- Run this in Supabase SQL Editor to audit and correct vote counts.
-- This script is READ-ONLY for diagnosis, then has a separate CORRECTION section.
--
-- HOW IT WORKS:
-- The correct vote count for each nominee = sum of votes_count from all
-- paid voting payments where metadata->>'nominee_id' matches the nominee.
-- Any difference between this and the current votes_count is the inflation/deficit.
-- =====================================================


-- =====================================================
-- PART 1: DIAGNOSIS (Read-only, safe to run anytime)
-- =====================================================

-- 1A. Overview: Total payments by status
SELECT
  status,
  COUNT(*) AS count,
  SUM(amount) AS total_amount_ghs
FROM payments
GROUP BY status
ORDER BY count DESC;

-- 1B. Overview: Voting payments by status and is_votes_credited
SELECT
  status,
  is_votes_credited,
  COUNT(*) AS count,
  SUM(CAST(metadata->>'votes_count' AS integer)) AS total_votes_in_metadata
FROM payments
WHERE payment_type = 'voting'
  AND metadata->>'nominee_id' IS NOT NULL
GROUP BY status, is_votes_credited
ORDER BY status, is_votes_credited;

-- 1C. Per-nominee: Current votes_count vs correct count from paid transactions
-- This is the KEY diagnostic query — shows exactly which nominees are inflated or deflated
WITH paid_votes AS (
  SELECT
    metadata->>'nominee_id' AS nominee_id,
    SUM(CAST(metadata->>'votes_count' AS integer)) AS correct_votes
  FROM payments
  WHERE status = 'paid'
    AND payment_type = 'voting'
    AND metadata->>'nominee_id' IS NOT NULL
    AND is_votes_credited = true
  GROUP BY metadata->>'nominee_id'
),
current_votes AS (
  SELECT
    id AS nominee_id,
    name,
    votes_count AS displayed_votes
  FROM nominees
)
SELECT
  cv.nominee_id,
  cv.name,
  cv.displayed_votes AS current_votes_count,
  COALESCE(pv.correct_votes, 0) AS correct_votes_from_payments,
  cv.displayed_votes - COALESCE(pv.correct_votes, 0) AS discrepancy,
  CASE
    WHEN cv.displayed_votes > COALESCE(pv.correct_votes, 0) THEN 'INFLATED'
    WHEN cv.displayed_votes < COALESCE(pv.correct_votes, 0) THEN 'DEFICIT'
    ELSE 'CORRECT'
  END AS status
FROM current_votes cv
LEFT JOIN paid_votes pv ON cv.nominee_id = pv.nominee_id
WHERE cv.displayed_votes != COALESCE(pv.correct_votes, 0)
ORDER BY ABS(cv.displayed_votes - COALESCE(pv.correct_votes, 0)) DESC;

-- 1D. Find payments that may have been double-credited
-- (payments where is_votes_credited = true AND status != 'paid')
SELECT
  id,
  client_reference,
  status,
  is_votes_credited,
  metadata->>'nominee_id' AS nominee_id,
  metadata->>'votes_count' AS votes_in_metadata,
  customer_name,
  amount,
  created_at
FROM payments
WHERE payment_type = 'voting'
  AND is_votes_credited = true
  AND status != 'paid'
ORDER BY created_at DESC;

-- 1E. Find duplicate payments for the same nominee+amount (potential double-credits)
SELECT
  client_reference,
  COUNT(*) AS duplicate_count,
  SUM(CAST(metadata->>'votes_count' AS integer)) AS total_votes_credited,
  MAX(customer_name) AS customer_name
FROM payments
WHERE status = 'paid'
  AND payment_type = 'voting'
  AND metadata->>'nominee_id' IS NOT NULL
GROUP BY client_reference
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 1F. Find payments where votes were credited but payment is still pending
SELECT
  id,
  client_reference,
  status,
  is_votes_credited,
  metadata->>'nominee_id' AS nominee_id,
  metadata->>'votes_count' AS votes_in_metadata,
  customer_name,
  amount,
  created_at
FROM payments
WHERE payment_type = 'voting'
  AND status = 'pending'
  AND is_votes_credited = true
ORDER BY created_at DESC;

-- 1G. Summary of total inflation across all nominees
WITH paid_votes AS (
  SELECT
    metadata->>'nominee_id' AS nominee_id,
    SUM(CAST(metadata->>'votes_count' AS integer)) AS correct_votes
  FROM payments
  WHERE status = 'paid'
    AND payment_type = 'voting'
    AND metadata->>'nominee_id' IS NOT NULL
    AND is_votes_credited = true
  GROUP BY metadata->>'nominee_id'
),
current_votes AS (
  SELECT
    id AS nominee_id,
    votes_count AS displayed_votes
  FROM nominees
)
SELECT
  SUM(cv.displayed_votes) AS total_displayed_votes,
  SUM(COALESCE(pv.correct_votes, 0)) AS total_correct_votes,
  SUM(cv.displayed_votes) - SUM(COALESCE(pv.correct_votes, 0)) AS total_inflation,
  COUNT(*) FILTER (WHERE cv.displayed_votes > COALESCE(pv.correct_votes, 0)) AS nominees_inflated,
  COUNT(*) FILTER (WHERE cv.displayed_votes < COALESCE(pv.correct_votes, 0)) AS nominees_deficit,
  COUNT(*) FILTER (WHERE cv.displayed_votes = COALESCE(pv.correct_votes, 0)) AS nominees_correct
FROM current_votes cv
LEFT JOIN paid_votes pv ON cv.nominee_id = pv.nominee_id;


-- =====================================================
-- PART 2: CORRECTION (Uncomment and run after reviewing Part 1)
-- =====================================================
-- WARNING: This will overwrite all nominee votes_count values.
-- Make sure you've reviewed the diagnosis results above first.
-- This is safe to run multiple times (idempotent).

/*
-- 2A. Reset all nominee votes_count to 0
UPDATE nominees SET votes_count = 0;

-- 2B. Recalculate correct votes from ALL paid voting transactions
-- Uses is_votes_credited = true to only count votes that were actually credited
UPDATE nominees n
SET votes_count = COALESCE(correct_sum.total, 0)
FROM (
  SELECT
    metadata->>'nominee_id' AS nominee_id,
    SUM(CAST(metadata->>'votes_count' AS integer)) AS total
  FROM payments
  WHERE status = 'paid'
    AND payment_type = 'voting'
    AND metadata->>'nominee_id' IS NOT NULL
    AND is_votes_credited = true
  GROUP BY metadata->>'nominee_id'
) correct_sum
WHERE n.id = correct_sum.nominee_id::uuid;

-- 2C. Set nominees with no paid votes to 0 (already done in 2A, but explicit)
UPDATE nominees
SET votes_count = 0
WHERE id NOT IN (
  SELECT DISTINCT metadata->>'nominee_id'::uuid
  FROM payments
  WHERE status = 'paid'
    AND payment_type = 'voting'
    AND metadata->>'nominee_id' IS NOT NULL
    AND is_votes_credited = true
);

-- 2D. Un-mark payments that were incorrectly marked as credited
-- (payments where status != 'paid' but is_votes_credited = true)
UPDATE payments
SET is_votes_credited = false
WHERE payment_type = 'voting'
  AND is_votes_credited = true
  AND status != 'paid';

-- 2E. Verify the correction
WITH paid_votes AS (
  SELECT
    metadata->>'nominee_id' AS nominee_id,
    SUM(CAST(metadata->>'votes_count' AS integer)) AS correct_votes
  FROM payments
  WHERE status = 'paid'
    AND payment_type = 'voting'
    AND metadata->>'nominee_id' IS NOT NULL
    AND is_votes_credited = true
  GROUP BY metadata->>'nominee_id'
)
SELECT
  n.id,
  n.name,
  n.votes_count AS corrected_votes,
  COALESCE(pv.correct_votes, 0) AS expected_votes,
  n.votes_count - COALESCE(pv.correct_votes, 0) AS remaining_discrepancy
FROM nominees n
LEFT JOIN paid_votes pv ON n.id = pv.nominee_id::uuid
WHERE n.votes_count != COALESCE(pv.correct_votes, 0)
ORDER BY ABS(n.votes_count - COALESCE(pv.correct_votes, 0)) DESC;
*/


-- =====================================================
-- PART 3: EDGE CASE — Payments without nominee_id in metadata
-- =====================================================
-- Some old payments might have nominee info in metadata but not as nominee_id.
-- This query finds them so you can manually investigate.

/*
SELECT
  id,
  client_reference,
  status,
  metadata,
  amount,
  customer_name,
  created_at
FROM payments
WHERE payment_type = 'voting'
  AND status = 'paid'
  AND (metadata->>'nominee_id' IS NULL OR metadata->>'nominee_id' = '')
  AND (metadata->>'nominee_code' IS NOT NULL OR metadata->>'nominee_name' IS NOT NULL)
ORDER BY created_at DESC;
*/
