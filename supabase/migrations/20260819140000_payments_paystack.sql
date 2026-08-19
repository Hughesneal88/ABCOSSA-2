-- ABCOSSA: Paystack Payment Gateway & Financial Transactions Migration

-- 1. Ensure payments table exists with required fields
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  client_reference text not null unique,
  checkout_id text,
  transaction_id text,
  amount numeric(10, 2) not null,
  currency text not null default 'GHS',
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  payment_type text not null default 'dues', -- 'dues', 'event', 'donation', 'voting'
  status text not null default 'pending',     -- 'pending', 'paid', 'failed', 'cancelled'
  payment_channel text,                      -- 'mobile_money', 'card', 'mtn-gh', 'telecel-gh', 'at-gh'
  description text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Seed default Paystack settings in public.site_settings
insert into public.site_settings (key, value) values
  ('paystack_public_key', ''),
  ('paystack_secret_key', ''),
  ('paystack_merchant_email', ''),
  ('paystack_currency', 'GHS')
on conflict (key) do nothing;

-- 3. Enable RLS
alter table public.payments enable row level security;

-- 4. Policies
drop policy if exists "payments_insert_public" on public.payments;
create policy "payments_insert_public" on public.payments for insert with check (true);

drop policy if exists "payments_select_public" on public.payments;
create policy "payments_select_public" on public.payments for select using (true);

drop policy if exists "payments_update_public" on public.payments;
create policy "payments_update_public" on public.payments for update using (true) with check (true);

drop policy if exists "payments_editors_all" on public.payments;
create policy "payments_editors_all" on public.payments for all to authenticated
  using (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

-- 5. Grants
grant select, insert, update on public.payments to anon, authenticated;
grant delete on public.payments to authenticated;
