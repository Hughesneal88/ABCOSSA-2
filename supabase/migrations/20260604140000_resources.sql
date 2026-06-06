-- Academic resource folders (lecture slides on Google Drive)
create table if not exists public.resources (
  id           uuid        primary key default gen_random_uuid(),
  year         text        not null,          -- 'L100', 'L200', 'L300', 'L400'
  semester     text        not null,          -- '1st', '2nd'
  label        text        not null,          -- display name shown on the page
  drive_url    text        not null,          -- Google Drive folder URL
  display_order integer    not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.resources enable row level security;

create policy "resources_select" on public.resources
  for select using (true);

create policy "resources_write" on public.resources
  for all to authenticated
  using  (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.content_editors m where m.email = (select auth.jwt() ->> 'email')));

grant select on public.resources to anon, authenticated;
grant insert, update, delete on public.resources to authenticated;

-- Seed the initial folders provided at launch
insert into public.resources (year, semester, label, drive_url, display_order) values
  ('L100', '2nd', 'L100 2nd Semester Slides',      'https://drive.google.com/drive/folders/1f_xkJvvxjj2cN1IopaAPubwTtG_47COU',  0),
  ('L200', '2nd', 'L200 2nd Semester Slides',      'https://drive.google.com/drive/folders/193HFnY2cB2Fdjuw8BDCUAKdbotazo44-',  1),
  ('L300', '2nd', 'L300 2nd Semester Slides',      'https://drive.google.com/drive/folders/1AGoxdFKwY9bjM0xFMvTAAcy6t4FIxR0h',  2),
  ('L400', '2nd', 'L400 2nd Semester Slides',      'https://drive.google.com/drive/folders/1DZcqrxOwIQIzOLJxyTK7x4B-Xtp8pJLR',  3),
  ('L200', '1st', 'L200 1st Semester Slides',      'https://drive.google.com/drive/folders/1Q_PMGMayHe77gznEJTy7gw1rCxzOnhTd',  4),
  ('L200', '1st', 'L200 1st Semester Slides — 2',  'https://drive.google.com/drive/folders/1lYJZ4F95os6tuZxQU9mcrQQRdM8nd2wr',  5),
  ('L200', '1st', 'L200 1st Semester Slides — 3',  'https://drive.google.com/drive/folders/1n9G5AaEBJRVAs1NjEOZvu8jJKzTwa0dY',  6),
  ('L200', '1st', 'L200 1st Semester Slides — 4',  'https://drive.google.com/drive/folders/1HS8Ship1M13pgazTr2Xir-Gcbu0IJqi0',  7)
on conflict do nothing;
