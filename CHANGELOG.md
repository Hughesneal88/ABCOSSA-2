# Changelog

All notable changes to the ABCOSSA-2 project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased] — 2026-09-16

### Fixed — Critical Vote Counting Bugs

**Why:** Users reported inflated vote counts (votes appearing for payments that were never completed) and missing votes (payments confirmed on Paystack but not reflected in nominee vote counts). Root cause analysis identified 5 bugs across 7 vote-crediting code paths.

#### 1. Atomic Vote Increment (Prevents Race Conditions)

**Problem:** All 7 paths that credited votes used a non-atomic read→add→write pattern:
```
// BEFORE (broken):
const { data: nominee } = await supabase.from("nominees").select("votes_count").eq("id", nomineeId);
const newVotes = (nominee.votes_count || 0) + votesCount;
await supabase.from("nominees").update({ votes_count: newVotes }).eq("id", nomineeId);
```
If two requests (e.g., webhook + client verify) read `votes_count` at the same time, they both compute the same `newVotes` and both write it — one set of votes is silently lost. Conversely, if both credit votes, the count doubles.

**Fix:** Created PostgreSQL RPC functions `credit_votes_atomic()` and `deduct_votes_atomic()` that use SQL-level atomic increments with row-level locking. All 7 code paths now call these RPCs instead of doing read-modify-write in application code.

**Files changed:**
- `supabase/migrations/20260916120000_atomic_vote_increment.sql` (new — RPC functions + migration)
- `src/lib/paystackClient.ts` — `verifyPaymentTransaction()`, `syncPaystackTransactionsDirectly()`, `importPaystackCsv()`
- `src/hooks/usePayments.ts` — `useUpdatePaymentStatus()`, `useDeletePayment()`
- `supabase/functions/paystack-webhook/index.ts`
- `supabase/functions/paystack-verify/index.ts`

#### 2. Webhook Idempotency Guard (Prevents Double-Crediting)

**Problem:** Paystack sends webhooks multiple times for the same transaction. The webhook handler had no way to know if votes were already credited, so it would credit them again on each delivery.

**Fix:** The `credit_votes_atomic()` RPC function checks the `is_votes_credited` flag on the payment record. If already true, it returns NULL and no-op. This guarantees each payment can only credit votes once, regardless of how many times the webhook fires.

**Affected file:** `supabase/functions/paystack-webhook/index.ts`

#### 3. Webhook + Client Verify Race Condition (Prevents Double-Crediting)

**Problem:** When Paystack confirms a payment, both the webhook AND the client-side verification could fire concurrently. Both would read `status="pending"`, both would update to `status="paid"`, and both would increment `votes_count` — resulting in double-counted votes.

**Fix:** The atomic RPC's `is_votes_credited` flag acts as a distributed lock. Only the first caller to set the flag to `true` will credit votes. The second caller sees the flag is already `true` and skips.

**Affected files:** `supabase/functions/paystack-webhook/index.ts`, `supabase/functions/paystack-verify/index.ts`, `src/lib/paystackClient.ts`

#### 4. Webhook Signature Verification (Security Hardening)

**Problem:** If `secretKey` was an empty string, the webhook handler would skip HMAC-SHA512 signature verification entirely, allowing anyone to send fake webhook payloads and credit votes without paying.

**Fix:** Webhook now rejects requests with a 500 error if no secret key is configured. Signature header is also required (400 if missing).

**Affected file:** `supabase/functions/paystack-webhook/index.ts`

#### 5. `is_votes_credited` Column on Payments Table

**Problem:** There was no way to reliably determine if a payment's votes had already been credited. The old `wasAlreadyPaid` check (comparing `status === "paid"`) was insufficient because the status could be updated before or after vote crediting in different code paths.

**Fix:** Added `is_votes_credited boolean not null default false` column to the `payments` table. This flag is set atomically inside the RPC function, providing a single source of truth for vote crediting status.

**Migration:** `supabase/migrations/20260916120000_atomic_vote_increment.sql`

- Backfill: Existing `payments` rows with `status = 'paid'` and `payment_type = 'voting'` are marked as `is_votes_credited = true` to prevent double-counting during the transition period.

#### 6. PaymentRecord Type Updated

**Why:** The `PaymentRecord` TypeScript interface needed the new `is_votes_credited` field to match the database schema.

**File:** `src/lib/paystackClient.ts`

---

## Pre-existing Changes (Before This Session)

These changes were already in the repository before the vote-fixing work:

- Paystack payment gateway integration (migrated from Hubtel)
- USSD voting system with Arkesel gateway
- Admin content portal (staff editors)
- Research hub with publications and projects
- Internship listings with JSON fallback
- Dark/light/system theme support
- Session timeout for admin portal
- PDF nominee parsing for batch uploads
- Domain routing (admin.abcossa.org subdomain)
- Netlify deployment configuration
