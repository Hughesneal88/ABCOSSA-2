# ABCOSSA-2 — Current State

**Last Updated:** 2026-09-16

---

## Project Overview

ABCOSSA (Animal Biology and Conservation Science Student Association) is a full-featured association website for the University of Ghana, featuring a Dinner Awards voting system, payment processing, content management, research hub, internship listings, and an admin staff portal.

**Stack:** Vite + React 18 + TypeScript + Tailwind CSS v3 + shadcn/ui + Supabase (PostgreSQL + Edge Functions + Storage) + Paystack (Ghana GHS payments)

**Deployed on:** Netlify (SPA with `/* → /index.html` redirect)

---

## What Works

| Feature | Status | Notes |
|---------|--------|-------|
| Public site (Home, About, Events, Gallery, Contact) | ✅ Working | Static content + Supabase data |
| Nominees listing with search/filter | ✅ Working | Client-side search across all categories |
| Voting flow (Paystack popup → payment → verify → credit) | ✅ Fixed | Now uses atomic RPC for all vote crediting |
| Payment reconciliation (manual verify, auto-sync, CSV import) | ✅ Fixed | All paths now use atomic RPC |
| Admin content portal | ✅ Working | Editors can manage all content types |
| USSD voting | ✅ Working | Mobile money via Paystack |
| Research hub | ✅ Working | Publications, projects, resources |
| Internship listings | ✅ Working | Supabase or static JSON fallback |
| Dark/light theme | ✅ Working | Persisted in localStorage |
| Session timeout (15min idle / 8hr max) | ✅ Working | Auto-logout for admin |

---

## Critical Fixes Applied (2026-09-16)

### Issue: Inflated/Lost Votes

**Root Causes:**
1. **Non-atomic vote increments** — All 7 vote-crediting paths used read→add→write (TOCTOU race condition)
2. **Webhook double-crediting** — Paystack sends webhooks multiple times; no idempotency guard
3. **Webhook + client verify race** — Both paths could credit votes for the same payment concurrently
4. **Webhook signature bypass** — If `secretKey` was empty, signature verification was skipped
5. **No `is_votes_credited` flag** — No way to know if votes were already counted for a payment

**Fix Applied:**
- Created `credit_votes_atomic()` and `deduct_votes_atomic()` SQL functions (Supabase RPC)
- Added `is_votes_credited` column to `payments` table
- All 7 vote-crediting paths now use atomic RPC instead of non-atomic read-modify-write
- Webhook now requires signature verification (rejects if secret key missing)
- Backfill migration marks existing paid voting payments as already credited

---

## Architecture

```
Browser (SPA)  ──HTTP──▶  Supabase (Postgres + Edge Functions + Storage)
                              │
                              ├── Paystack API (payments + verification)
                              ├── Paystack webhook (HMAC-SHA512)
                              └── Arkesel/Hubtel USSD gateway
```

### Vote Crediting Flow (After Fix)

```
1. User clicks "Vote" → PaystackCheckoutModal opens Paystack popup
2. Payment record created in Supabase (status: "pending")
3. Paystack processes payment
4. Two paths converge:
   a. Webhook (paystack-webhook) → updates status → calls credit_votes_atomic()
   b. Client verify (paystack-verify) → updates status → calls credit_votes_atomic()
5. credit_votes_atomic() is idempotent:
   - Checks is_votes_credited flag
   - If false: sets flag = true, increments votes_count atomically
   - If true: returns NULL (no-op)
6. Race condition prevented by PostgreSQL row-level locking in the RPC function
```

---

## File Structure

```
src/
├── main.tsx                  # Entry point
├── App.tsx                   # Router, lazy-loaded routes, theme/query providers
├── index.css                 # Tailwind + CSS variables (forest green palette)
├── config/site.ts            # Vision, mission, contact info, social links
├── integrations/supabase/client.ts  # Supabase client
├── lib/
│   ├── utils.ts              # cn() helper
│   ├── domainRouting.ts      # Subdomain detection
│   ├── slugify.ts            # URL slug generation
│   ├── paystackClient.ts     # Paystack popup, payment CRUD, verification, sync, CSV import
│   ├── hubtelClient.ts       # Re-exports paystackClient (backward compat)
│   └── pdfNomineeParser.ts   # PDF text extraction + nominee parsing
├── hooks/
│   ├── useNominees.ts        # Award categories, nominees, vote price, USSD settings
│   ├── usePayments.ts        # Payment CRUD, Paystack settings, verification, sync, reconciliation
│   ├── useInternships.ts     # Internship listings
│   ├── useSupabasePublic.ts  # Events, announcements, blog, leadership, etc.
│   ├── useSessionTimeout.ts  # Admin session timeout
│   ├── useTheme.tsx          # Dark/light/system theme context
│   └── use-mobile.tsx        # Mobile breakpoint detection
├── components/
│   ├── layout/               # Layout, Navbar, Footer
│   ├── admin/                # NomineesExportModal
│   ├── payment/              # PaystackCheckoutModal, HubtelCheckoutModal
│   ├── voting/               # UssdInstructionsModal
│   ├── shared/               # NavLink, ThemeToggle
│   └── ui/                   # 49 shadcn components
├── pages/
│   ├── Index.tsx             # Landing page
│   ├── NomineesPage.tsx      # Voting interface with search/filter
│   ├── AboutPage.tsx, EventsPage.tsx, etc.
│   ├── admin/
│   │   ├── StaffPortal.tsx   # Admin dashboard
│   │   ├── AdminRoute.tsx    # Route guard (component-level only!)
│   │   └── pages/            # 15 admin sub-pages
│   └── NotFound.tsx
supabase/
├── functions/
│   ├── paystack-webhook/     # Webhook handler (HMAC-SHA512 verification)
│   ├── paystack-verify/      # Manual verification endpoint
│   └── paystack-checkout/    # Server-side checkout creation
├── migrations/               # 15 SQL migration files
```

---

## Known Issues (Still Open)

| # | Issue | Severity | Notes |
|---|-------|----------|-------|
| 1 | Admin route guard is component-level, not router-level | 🟡 Medium | `/admin` accessible without auth, AdminRoute redirects |
| 2 | `site_settings` RLS allows anon reads of `paystack_secret_key` | 🟡 Medium | Secret key visible in browser network tab |
| 3 | Dead code: `App.css` (empty), `hubtelClient.ts` (re-exports) | 🟢 Low | Cosmetic |
| 4 | Missing `/privacy` and `/terms` routes in router | 🟢 Low | Links exist but routes 404 |
| 5 | `VITE_PAYSTACK_PUBLIC_KEY` not in env type declarations | 🟢 Low | Works but no autocomplete |

---

## Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `award_categories` | Award categories with vote pricing | `title`, `vote_price_ghs`, `is_active`, `display_order` |
| `nominees` | Nominees per category | `category_id`, `name`, `votes_count`, `is_published` |
| `payments` | All financial transactions | `client_reference`, `status`, `metadata`, **`is_votes_credited`** |
| `nominee_pdf_uploads` | PDF batch upload tracking | `file_url`, `parsed_count` |
| `site_settings` | Key-value config store | `key`, `value` |
| `content_editors` | Admin staff portal access | `email`, `role` |
| `events` | Association events | `title`, `description`, `event_date` |
| `announcements` | News/announcements | `title`, `content`, `priority` |
| `blog_posts` | Blog articles | `title`, `content`, `author` |
| `leadership` | Executive committee | `name`, `position`, `image_url` |
| `lecturers` | Faculty directory | `name`, `title`, `department` |
| `research_publications` | Research papers | `title`, `authors`, `publication_date` |
| `internships` | Internship listings | `title`, `company`, `deadline` |

---

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `VITE_PAYSTACK_PUBLIC_KEY` | Paystack public key (pk_live_ or pk_test_) | Optional (can use DB) |

---

## Deployment

- **Frontend:** Netlify (auto-deploy on push to main)
- **Backend:** Supabase Edge Functions (auto-deploy with migrations)
- **Database:** Supabase PostgreSQL (migrations via `supabase/migrations/`)
