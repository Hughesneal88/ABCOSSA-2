-- Add image columns
alter table public.internships
  add column if not exists cover_image_url text,
  add column if not exists logo_url text;

alter table public.events
  add column if not exists cover_image_url text;

-- Internship images bucket
insert into storage.buckets (id, name, public)
values ('internship-images', 'internship-images', true)
on conflict (id) do nothing;

create policy "internship_images_public_read" on storage.objects for select
  using (bucket_id = 'internship-images');

create policy "internship_images_editors_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'internship-images' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "internship_images_editors_update" on storage.objects for update to authenticated
  using (bucket_id = 'internship-images' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "internship_images_editors_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'internship-images' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

-- Event images bucket
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

create policy "event_images_public_read" on storage.objects for select
  using (bucket_id = 'event-images');

create policy "event_images_editors_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-images' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "event_images_editors_update" on storage.objects for update to authenticated
  using (bucket_id = 'event-images' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

create policy "event_images_editors_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'event-images' and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));
