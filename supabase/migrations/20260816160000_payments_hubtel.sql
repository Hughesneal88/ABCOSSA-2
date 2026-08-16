-- ABCOSSA: Hubtel Payment Gateway & Financial Transactions
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
  payment_channel text,                      -- 'mtn-gh', 'telecel-gh', 'at-gh', 'card'
  description text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed default Hubtel settings in public.site_settings
insert into public.site_settings (key, value) values
  ('hubtel_merchant_account_number', '2019842'),
  ('hubtel_client_id', ''),
  ('hubtel_client_secret', '')
on conflict (key) do nothing;

-- Enable RLS
alter table public.payments enable row level security;

-- Public can create payment records when checking out
create policy "payments_insert_public" on public.payments for insert with check (true);

-- Anyone can check status of their own transaction by client_reference
create policy "payments_select_public" on public.payments for select using (true);

-- Editors can read, update, delete payments
create policy "payments_editors_all" on public.payments for all to authenticated
  using (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

-- Grants
grant select, insert, update on public.payments to anon, authenticated;
grant delete on public.payments to authenticated;
