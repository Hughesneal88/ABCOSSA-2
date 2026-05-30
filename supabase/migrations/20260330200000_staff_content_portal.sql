-- ABCOSSA: staff-managed content (no SQL needed for posters — use /admin on the website)
-- Run once in Supabase SQL Editor. Add more editors: INSERT INTO content_editors (email) VALUES ('name@org.com');

create table if not exists public.content_editors (
  email text primary key
);

create table if not exists public.internships (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  organization text not null,
  location text,
  timeframe text,
  deadline date,
  description text not null,
  apply_url text,
  tags text[] not null default '{}',
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type text not null default 'Workshop',
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  register_url text,
  featured boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  link_url text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  body text not null,
  category text not null default 'News',
  cover_image_url text,
  is_published boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_internships_published on public.internships (is_published, created_at desc);
create index if not exists idx_events_starts on public.events (starts_at);
create index if not exists idx_announcements_created on public.announcements (created_at desc);
create index if not exists idx_blog_slug on public.blog_posts (slug);
create index if not exists idx_blog_published on public.blog_posts (is_published, published_at desc);

alter table public.content_editors enable row level security;
alter table public.internships enable row level security;
alter table public.events enable row level security;
alter table public.announcements enable row level security;
alter table public.blog_posts enable row level security;

-- Editors can see their own row
create policy "content_editors_select_self"
  on public.content_editors for select to authenticated
  using (email = (select auth.jwt() ->> 'email'));

-- Published content visible to everyone; editors see all rows
create policy "internships_select"
  on public.internships for select
  using (
    is_published = true
    or exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email'))
  );

create policy "internships_write"
  on public.internships for all to authenticated
  using (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "events_select"
  on public.events for select
  using (
    is_published = true
    or exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email'))
  );

create policy "events_write"
  on public.events for all to authenticated
  using (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "announcements_select"
  on public.announcements for select
  using (
    is_published = true
    or exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email'))
  );

create policy "announcements_write"
  on public.announcements for all to authenticated
  using (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "blog_select"
  on public.blog_posts for select
  using (
    is_published = true
    or exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email'))
  );

create policy "blog_write"
  on public.blog_posts for all to authenticated
  using (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

insert into public.content_editors (email)
values ('abcossa22@gmail.com')
on conflict (email) do nothing;

grant select on public.internships to anon, authenticated;
grant select on public.events to anon, authenticated;
grant select on public.announcements to anon, authenticated;
grant select on public.blog_posts to anon, authenticated;
grant select on public.content_editors to authenticated;
grant insert, update, delete on public.internships to authenticated;
grant insert, update, delete on public.events to authenticated;
grant insert, update, delete on public.announcements to authenticated;
grant insert, update, delete on public.blog_posts to authenticated;

-- Optional cover images for blog posts (public read)
insert into storage.buckets (id, name, public)
values ('blog-covers', 'blog-covers', true)
on conflict (id) do nothing;

create policy "blog_covers_public_read"
  on storage.objects for select
  using (bucket_id = 'blog-covers');

create policy "blog_covers_editors_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'blog-covers'
    and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email'))
  );

create policy "blog_covers_editors_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'blog-covers'
    and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email'))
  );

create policy "blog_covers_editors_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'blog-covers'
    and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email'))
  );
