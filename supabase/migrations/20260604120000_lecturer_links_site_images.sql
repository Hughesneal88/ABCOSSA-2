-- Add links array to lecturer profiles (stored as JSONB [{label, url}])
alter table public.lecturers
  add column if not exists links jsonb not null default '[]'::jsonb;

-- Site images table: staff-uploaded overrides for named static images
create table if not exists public.site_images (
  key        text primary key,
  label      text not null,
  url        text not null,
  updated_at timestamptz not null default now()
);

alter table public.site_images enable row level security;

-- Anyone can read (images are public)
create policy "site_images_select" on public.site_images
  for select using (true);

-- Only authenticated editors can write
create policy "site_images_write" on public.site_images
  for all to authenticated
  using  (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

grant select on public.site_images to anon, authenticated;
grant insert, update, delete on public.site_images to authenticated;

-- Storage bucket for site image overrides
insert into storage.buckets (id, name, public)
  values ('site-images', 'site-images', true)
  on conflict (id) do nothing;

create policy "site_images_public_read" on storage.objects
  for select using (bucket_id = 'site-images');

create policy "site_images_editors_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'site-images' and
    exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email'))
  );

create policy "site_images_editors_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'site-images' and
    exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email'))
  );

create policy "site_images_editors_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'site-images' and
    exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email'))
  );
