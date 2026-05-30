-- Link editors to auth.users so email can change without losing access; centralize editor checks.

alter table public.content_editors
  add column if not exists user_id uuid unique references auth.users (id) on delete cascade;

create or replace function public.is_content_editor ()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.content_editors m
    where m.user_id = auth.uid()
       or (
         m.user_id is null
         and lower(trim(m.email)) = lower(trim(coalesce((select auth.jwt() ->> 'email'), '')))
       )
  );
$$;

grant execute on function public.is_content_editor () to anon, authenticated;

drop policy if exists "content_editors_select_self" on public.content_editors;

create policy "content_editors_select_self"
  on public.content_editors for select to authenticated
  using (
    email = (select auth.jwt() ->> 'email')
    or user_id = auth.uid()
  );

-- First-time link: JWT email matches row, user_id still null
create policy "content_editors_link_user_id"
  on public.content_editors for update to authenticated
  using (
    email = (select auth.jwt() ->> 'email')
    and user_id is null
  )
  with check (
    user_id = auth.uid()
    and email = (select auth.jwt() ->> 'email')
  );

-- After link: change login email in DB (before/with Supabase Auth email change)
create policy "content_editors_update_linked"
  on public.content_editors for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant update on public.content_editors to authenticated;

drop policy if exists "internships_select" on public.internships;
drop policy if exists "internships_write" on public.internships;
drop policy if exists "events_select" on public.events;
drop policy if exists "events_write" on public.events;
drop policy if exists "announcements_select" on public.announcements;
drop policy if exists "announcements_write" on public.announcements;
drop policy if exists "blog_select" on public.blog_posts;
drop policy if exists "blog_write" on public.blog_posts;

create policy "internships_select"
  on public.internships for select
  using (is_published = true or (select public.is_content_editor ()));

create policy "internships_write"
  on public.internships for all to authenticated
  using ((select public.is_content_editor ()))
  with check ((select public.is_content_editor ()));

create policy "events_select"
  on public.events for select
  using (is_published = true or (select public.is_content_editor ()));

create policy "events_write"
  on public.events for all to authenticated
  using ((select public.is_content_editor ()))
  with check ((select public.is_content_editor ()));

create policy "announcements_select"
  on public.announcements for select
  using (is_published = true or (select public.is_content_editor ()));

create policy "announcements_write"
  on public.announcements for all to authenticated
  using ((select public.is_content_editor ()))
  with check ((select public.is_content_editor ()));

create policy "blog_select"
  on public.blog_posts for select
  using (is_published = true or (select public.is_content_editor ()));

create policy "blog_write"
  on public.blog_posts for all to authenticated
  using ((select public.is_content_editor ()))
  with check ((select public.is_content_editor ()));

drop policy if exists "blog_covers_editors_upload" on storage.objects;
drop policy if exists "blog_covers_editors_update" on storage.objects;
drop policy if exists "blog_covers_editors_delete" on storage.objects;

create policy "blog_covers_editors_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'blog-covers'
    and (select public.is_content_editor ())
  );

create policy "blog_covers_editors_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'blog-covers'
    and (select public.is_content_editor ())
  );

create policy "blog_covers_editors_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'blog-covers'
    and (select public.is_content_editor ())
  );
