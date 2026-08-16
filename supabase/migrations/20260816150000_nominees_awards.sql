-- ABCOSSA: Nominees & Awards module with PDF list uploads and vote pricing
create table if not exists public.award_categories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  vote_price_ghs numeric(10, 2) not null default 1.00,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.nominees (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.award_categories(id) on delete set null,
  name text not null,
  department text,
  level text,
  bio text not null default '',
  image_url text,
  votes_count integer not null default 0,
  source_pdf_url text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.nominee_pdf_uploads (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  file_url text not null,
  title text not null,
  parsed_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Seed initial vote price in site_settings
insert into public.site_settings (key, value) values
  ('vote_price_ghs', '1.00')
on conflict (key) do nothing;

-- Seed initial categories if none exist
insert into public.award_categories (title, description, vote_price_ghs, display_order) values
  ('Student of the Year', 'Recognizing outstanding academic excellence, leadership, and community service.', 1.00, 0),
  ('Best Researcher', 'Honoring exceptional contributions to biological and chemical sciences research.', 1.00, 1),
  ('Leadership Excellence', 'Awarded to student leaders demonstrating exemplary dedication to student welfare.', 1.00, 2),
  ('Most Innovative Project', 'Celebrating creative scientific solutions and technological innovations.', 1.00, 3)
on conflict do nothing;

-- Enable RLS
alter table public.award_categories enable row level security;
alter table public.nominees enable row level security;
alter table public.nominee_pdf_uploads enable row level security;

-- Policies for award_categories
create policy "award_categories_select" on public.award_categories for select using (true);
create policy "award_categories_write" on public.award_categories for all to authenticated
  using (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

-- Policies for nominees
create policy "nominees_select" on public.nominees for select
  using (is_published = true or exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "nominees_write" on public.nominees for all to authenticated
  using (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

-- Allow public to increment votes
create policy "nominees_vote_update" on public.nominees for update
  using (true) with check (true);

-- Policies for nominee_pdf_uploads
create policy "nominee_pdf_select" on public.nominee_pdf_uploads for select using (true);
create policy "nominee_pdf_write" on public.nominee_pdf_uploads for all to authenticated
  using (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

-- Grants
grant select on public.award_categories to anon, authenticated;
grant insert, update, delete on public.award_categories to authenticated;

grant select, update on public.nominees to anon, authenticated;
grant insert, update, delete on public.nominees to authenticated;

grant select on public.nominee_pdf_uploads to anon, authenticated;
grant insert, update, delete on public.nominee_pdf_uploads to authenticated;

-- Storage bucket for PDF nominee documents
insert into storage.buckets (id, name, public)
values ('nominee-documents', 'nominee-documents', true)
on conflict (id) do nothing;

create policy "nominee_docs_public_read" on storage.objects for select
  using (bucket_id = 'nominee-documents');

create policy "nominee_docs_editors_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'nominee-documents' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "nominee_docs_editors_update" on storage.objects for update to authenticated
  using (bucket_id = 'nominee-documents' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "nominee_docs_editors_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'nominee-documents' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));
