-- ABCOSSA: USSD Interactive Sessions State Table
create table if not exists public.ussd_sessions (
  session_id text primary key,
  user_id text not null,
  current_step text not null default 'MAIN_MENU',
  candidate_code text,
  nominee_id text,
  nominee_name text,
  category_id text,
  category_title text,
  category_page integer not null default 1,
  nominee_page integer not null default 1,
  quantity integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Index for session lookups
create index if not exists idx_ussd_sessions_user_id on public.ussd_sessions(user_id);
create index if not exists idx_ussd_sessions_updated_at on public.ussd_sessions(updated_at);

-- Enable RLS
alter table public.ussd_sessions enable row level security;

-- Policies for public / Edge Functions
drop policy if exists "ussd_sessions_all" on public.ussd_sessions;
create policy "ussd_sessions_all" on public.ussd_sessions for all using (true) with check (true);

-- Permissions
grant select, insert, update, delete on public.ussd_sessions to anon, authenticated, service_role;
