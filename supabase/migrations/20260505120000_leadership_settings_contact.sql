-- Leadership members
create table if not exists public.leadership_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  bio text not null default '',
  image_url text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Site settings (key-value)
create table if not exists public.site_settings (
  key text primary key,
  value text not null default ''
);

-- Contact form submissions
create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Seed default contact email
insert into public.site_settings (key, value)
values ('contact_email', 'abcossa22@gmail.com')
on conflict (key) do nothing;

-- RLS
alter table public.leadership_members enable row level security;
alter table public.site_settings enable row level security;
alter table public.contact_submissions enable row level security;

create policy "leadership_select" on public.leadership_members for select
  using (is_active = true or exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "leadership_write" on public.leadership_members for all to authenticated
  using (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "site_settings_select" on public.site_settings for select using (true);

create policy "site_settings_write" on public.site_settings for all to authenticated
  using (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "contact_submissions_insert" on public.contact_submissions for insert
  with check (true);

create policy "contact_submissions_editors_select" on public.contact_submissions for select to authenticated
  using (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "contact_submissions_editors_write" on public.contact_submissions for update to authenticated
  using (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "contact_submissions_editors_delete" on public.contact_submissions for delete to authenticated
  using (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

-- Grants
grant select on public.leadership_members to anon, authenticated;
grant insert, update, delete on public.leadership_members to authenticated;
grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;
grant insert on public.contact_submissions to anon, authenticated;
grant select, update, delete on public.contact_submissions to authenticated;

-- Leadership images bucket
insert into storage.buckets (id, name, public)
values ('leadership-images', 'leadership-images', true)
on conflict (id) do nothing;

create policy "leadership_images_public_read" on storage.objects for select
  using (bucket_id = 'leadership-images');

create policy "leadership_images_editors_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'leadership-images' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "leadership_images_editors_update" on storage.objects for update to authenticated
  using (bucket_id = 'leadership-images' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "leadership_images_editors_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'leadership-images' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));
