# Migration Guide — Atomic Vote Increment Fix

**Date:** 2026-09-16
**Commit:** `e29f84c`
**What it fixes:** Inflated and lost votes caused by race conditions and non-atomic vote counting

---

## Why This Migration Is Needed

The voting system had critical bugs where:
- Votes were double-counted when the webhook and client verification ran at the same time
- Votes were lost when two concurrent requests read the same vote count before writing
- Unpaid votes were being counted because there was no way to track if votes had already been credited

This migration creates **atomic database functions** that prevent all of these issues.

---

## Before You Start

- You need access to the **Supabase Dashboard** for the `abcossa` project
- This migration is **safe to run on a live database** — it uses `CREATE OR REPLACE` and `ADD COLUMN IF NOT EXISTS`
- The backfill step marks existing paid voting payments as already credited, so no double-counting occurs during the transition
- **No downtime required** — the app continues working while you run this

---

## Step-by-Step Instructions

### Step 1: Open the Supabase Dashboard

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select the **abcossa** project
3. Click **SQL Editor** in the left sidebar
4. Click **New query**

---

### Step 2: Run the Migration SQL

Copy and paste the entire SQL block below into the SQL Editor, then click **Run**:

```sql
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
  -- Atomically mark the payment as votes-credited (only succeeds once)
  -- If already credited, this returns 0 rows updated
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

-- 6. Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_payments_client_reference ON public.payments(client_reference);
CREATE INDEX IF NOT EXISTS idx_payments_is_votes_credited ON public.payments(is_votes_credited) WHERE is_votes_credited = false;
```

---

### Step 3: Verify the Migration Succeeded

After running, you should see **"Success. No rows returned"** in the output.

To verify everything is in place, run this check query:

```sql
-- Check that the function exists
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name IN ('credit_votes_atomic', 'deduct_votes_atomic');

-- Check that the column exists
SELECT column_name, column_default
FROM information_schema.columns
WHERE table_name = 'payments' AND column_name = 'is_votes_credited';

-- Check how many payments were backfilled
SELECT
  COUNT(*) FILTER (WHERE status = 'paid' AND payment_type = 'voting' AND is_votes_credited = true) AS credited,
  COUNT(*) FILTER (WHERE status = 'paid' AND payment_type = 'voting' AND is_votes_credited = false) AS not_credited
FROM payments;
```

**Expected results:**
- Two rows returned for the function check (`credit_votes_atomic` and `deduct_votes_atomic`)
- One row returned for the column check
- In the backfill check: `not_credited` should be **0** (all existing paid voting payments marked as credited)

---

### Step 4: Test the Functions

Run a quick manual test to make sure the functions work:

```sql
-- Test: Try crediting votes for a non-existent payment (should return NULL)
SELECT public.credit_votes_atomic(
  '00000000-0000-0000-0000-000000000000'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  5
);
-- Expected: NULL (payment doesn't exist, so no-op)

-- Test: Try deducting votes for a non-existent payment (should return NULL)
SELECT public.deduct_votes_atomic(
  '00000000-0000-0000-0000-000000000000'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  5
);
-- Expected: NULL (payment doesn't exist, so no-op)
```

---

### Step 5: Verify the Frontend

1. Wait for Netlify to finish rebuilding (check [app.netlify.com](https://app.netlify.com) for build status)
2. Go to the voting page and check that nominees load correctly
3. If you have a test payment, verify the vote count is accurate

---

## What Each Part Does

| Step | What It Does | Why It Matters |
|------|-------------|----------------|
| `ADD COLUMN is_votes_credited` | Adds a boolean flag to payments | Lets us track if votes were already counted for a payment |
| `credit_votes_atomic()` | Atomically marks payment + increments votes | Prevents race conditions and double-counting |
| `deduct_votes_atomic()` | Atomically unmarks payment + decrements votes | Allows safe vote reversal when payments fail |
| `GRANT EXECUTE` | Allows all roles to call the functions | Edge functions (service_role), client (anon/authenticated) all need access |
| `UPDATE SET is_votes_credited = true` | Backfills existing paid voting payments | Prevents double-counting during transition |
| `CREATE INDEX` | Speeds up lookups by reference and credit status | Webhook and verify queries run faster |

---

## Rollback (If Needed)

If something goes wrong, you can roll back:

```sql
-- Drop the functions
DROP FUNCTION IF EXISTS public.credit_votes_atomic(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.deduct_votes_atomic(uuid, uuid, integer);

-- Drop the indexes
DROP INDEX IF EXISTS public.idx_payments_client_reference;
DROP INDEX IF EXISTS public.idx_payments_is_votes_credited;

-- Note: The is_votes_credited column will remain but won't be used
-- The app will fall back to the old behavior (non-atomic voting)
```

**Warning:** Rolling back re-enables the race conditions. Only do this if the migration causes errors.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "function already exists" | Normal — `CREATE OR REPLACE` handles this. The function was updated. |
| "column already exists" | Normal — `ADD COLUMN IF NOT EXISTS` handles this. The column was already added. |
| App crashes after migration | Check that the frontend has been redeployed by Netlify |
| Votes still seem wrong | Use the **Recalculate Votes** button in the admin dashboard (see below) |
| "permission denied for function" | Run the GRANT statements in Step 4 again |

---

## Fixing Existing Inflated Votes

After running the migration above, the **atomic functions prevent new double-counting**. But votes that were already inflated before the fix are still wrong. There are two ways to fix them, in order of preference:

### Option A: Admin Dashboard "Recalculate Votes" Button (Try This First)

The admin dashboard has a built-in **Recalculate Votes** button that:
1. Fetches all paid voting transactions from the database
2. Sums up the votes for each nominee from those transactions
3. Overwrites each nominee's `votes_count` with the correct total

**How to use it:**
1. Go to the **Staff Portal** → **Dinner Awards** section
2. Click the **Recalculate Votes** button
3. The button will show how many discrepancies were fixed
4. Check the nominees page to confirm the counts look right

**When to use this:**
- This is the **recommended first step** for most situations
- It handles the majority of inflation cases automatically
- It's safe to run multiple times (idempotent)
- It runs from the browser, so it uses the same logic as the app

**Limitations:**
- If the database has a large number of payments (>1000), the client-side recalculation may time out
- It depends on the `payments` table having correct `metadata->>'nominee_id'` values — if some payments have missing nominee IDs, those votes won't be counted

### Option B: SQL Diagnostic & Correction Script (Last Resort)

If the dashboard button doesn't fix the issue, or you need to see exactly what's wrong before making changes, use the SQL diagnostic script at `supabase/migrations/20260916130000_diagnose_and_fix_inflated_votes.sql`.

**When to use this:**
- The Recalculate Votes button ran but votes still look wrong
- You need to **see** the discrepancies before fixing them (the script shows per-nominee inflation/deficit)
- You suspect edge-case issues (missing nominee IDs in metadata, duplicate payments, etc.)
- You want a database-level guarantee that the fix is correct

**How to run it:**

1. Open **Supabase Dashboard** → **SQL Editor** → **New query**
2. Copy **Part 1 (Diagnosis)** from the script and run it
3. Review the results:
   - Query 1C shows which nominees are INFLATED, DEFICIT, or CORRECT
   - Query 1D shows payments credited but not yet paid (fake votes)
   - Query 1E shows duplicate payments (double-credits)
   - Query 1G shows the total inflation summary
4. If the diagnosis confirms problems, uncomment **Part 2 (Correction)** and run it
5. Run Part 1 again to verify all discrepancies are fixed

**Important notes about Part 2:**
- Part 2 **resets all nominee votes to 0** then recalculates from scratch
- It only counts votes from payments where `status = 'paid' AND is_votes_credited = true`
- It's safe to run multiple times (idempotent)
- After running, verify the results with the verification query at the end of Part 2

**Part 3** (edge cases) is optional — only uncomment it if you see payments with `nominee_code` or `nominee_name` in metadata but no `nominee_id`.

### Which Option Should I Use?

| Situation | Use |
|-----------|-----|
| First time fixing after migration | **Option A** — Dashboard button |
| Dashboard button didn't fully fix it | **Option B** — SQL script |
| Need to see exactly what's inflated before fixing | **Option B** — SQL script Part 1 |
| Want to verify the dashboard fix was correct | **Option B** — SQL script Part 1 only |
| Large database (>1000 payments) | **Option B** — SQL script (client-side may time out) |
| Payments have missing nominee_id in metadata | **Option B** — SQL script (handles lookup by code/name too) |
