-- Nominee photos for Dinner Awards + category corrections

-- Storage bucket for nominee portraits (public read, editors upload)
insert into storage.buckets (id, name, public)
values ('nominee-images', 'nominee-images', true)
on conflict (id) do nothing;

drop policy if exists "nominee_images_public_read" on storage.objects;
create policy "nominee_images_public_read" on storage.objects
  for select using (bucket_id = 'nominee-images');

drop policy if exists "nominee_images_editors_upload" on storage.objects;
create policy "nominee_images_editors_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'nominee-images'
    and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email'))
  );

drop policy if exists "nominee_images_editors_update" on storage.objects;
create policy "nominee_images_editors_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'nominee-images'
    and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email'))
  );

drop policy if exists "nominee_images_editors_delete" on storage.objects;
create policy "nominee_images_editors_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'nominee-images'
    and exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email'))
  );

-- Move Ninepence nominees into Best Pals, add Blogger of the Year, seed its nominees
do $$
declare
  ninepence_id uuid;
  pals_id uuid;
  blogger_id uuid;
  next_code int;
begin
  select id into ninepence_id
  from public.award_categories
  where lower(title) ~ 'nine[[:space:]]*pence'
  limit 1;

  select id into pals_id
  from public.award_categories
  where lower(title) ~ 'best[[:space:]]*pals?'
  limit 1;

  if ninepence_id is not null and pals_id is not null then
    update public.nominees
    set category_id = pals_id
    where category_id = ninepence_id;
  elsif ninepence_id is not null and pals_id is null then
    update public.award_categories
    set title = 'Best Pals'
    where id = ninepence_id;
    ninepence_id := null;
  end if;

  if ninepence_id is not null then
    delete from public.award_categories where id = ninepence_id;
  end if;

  insert into public.award_categories (title, description, vote_price_ghs, display_order, is_active)
  select
    'Blogger of the Year',
    'Celebrating student blogs and digital storytellers in the ABCOSSA community.',
    coalesce((select vote_price_ghs from public.award_categories order by display_order limit 1), 1.00),
    coalesce((select max(display_order) from public.award_categories), 0) + 1,
    true
  where not exists (
    select 1 from public.award_categories where lower(title) = 'blogger of the year'
  );

  select id into blogger_id
  from public.award_categories
  where lower(title) = 'blogger of the year'
  limit 1;

  if blogger_id is null then
    return;
  end if;

  select coalesce(max(nominee_code::int), 100) into next_code
  from public.nominees
  where nominee_code ~ '^[0-9]+$';

  insert into public.nominees (name, category_id, bio, is_published, nominee_code)
  select v.name, blogger_id, '', true, (next_code + v.ord)::text
  from (
    values
      (1, 'AGABUS Blogs'),
      (2, 'GEN Z Blogs')
  ) as v(ord, name)
  where not exists (
    select 1
    from public.nominees existing
    where lower(existing.name) = lower(v.name)
  );

  delete from public.nominees
  where name ~* 'aegon[[:space:]]*iii';
end $$;
