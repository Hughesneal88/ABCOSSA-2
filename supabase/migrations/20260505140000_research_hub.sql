-- Lecturer profiles
create table if not exists public.lecturers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bio text,
  research_interests text[] not null default '{}',
  email text,
  image_url text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Research works (papers, theses, projects, etc.)
create table if not exists public.research_works (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author_name text not null,
  author_type text not null default 'student', -- 'student' or 'lecturer'
  category text not null default 'Paper',      -- Paper, Thesis, Project, Report, Poster, Other
  abstract text,
  year integer,
  link_url text,
  file_url text,
  tags text[] not null default '{}',
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.lecturers enable row level security;
alter table public.research_works enable row level security;

create policy "lecturers_select" on public.lecturers for select
  using (is_active = true or exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "lecturers_write" on public.lecturers for all to authenticated
  using (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "research_works_select" on public.research_works for select
  using (is_published = true or exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

-- Anyone can submit (unpublished by default), editors can manage
create policy "research_works_insert" on public.research_works for insert
  with check (is_published = false);

create policy "research_works_editors_write" on public.research_works for all to authenticated
  using (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

-- Grants
grant select on public.lecturers to anon, authenticated;
grant insert, update, delete on public.lecturers to authenticated;
grant select on public.research_works to anon, authenticated;
grant insert on public.research_works to anon, authenticated;
grant update, delete on public.research_works to authenticated;

-- Seed the 14 lecturers
insert into public.lecturers (name, display_order) values
  ('Dr. Godfred Futagbi', 0),
  ('Dr. Isaac F. Aboagye', 1),
  ('Dr. Juliet Ewool', 2),
  ('Dr. Daniel Oduro', 3),
  ('Prof. Benjamin Ofori', 4),
  ('Prof. Bentum', 5),
  ('Prof. Erasmus Owusu', 6),
  ('Dr. Jones Quartey', 7),
  ('Dr. Blankson', 8),
  ('Dr. Buxton', 9),
  ('Dr. Fred Aboagye-Antwi', 10),
  ('Dr. Samuel Adu-Acheampong', 11),
  ('Prof. Attaquayefio', 12),
  ('Prof. Rosina Kyerematen', 13)
on conflict do nothing;

-- Lecturer images bucket
insert into storage.buckets (id, name, public) values ('lecturer-images', 'lecturer-images', true) on conflict (id) do nothing;

create policy "lecturer_images_public_read" on storage.objects for select using (bucket_id = 'lecturer-images');

create policy "lecturer_images_editors_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'lecturer-images' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "lecturer_images_editors_update" on storage.objects for update to authenticated
  using (bucket_id = 'lecturer-images' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "lecturer_images_editors_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'lecturer-images' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

-- Research files bucket
insert into storage.buckets (id, name, public) values ('research-files', 'research-files', true) on conflict (id) do nothing;

create policy "research_files_public_read" on storage.objects for select using (bucket_id = 'research-files');

create policy "research_files_editors_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'research-files' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "research_files_editors_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'research-files' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));
