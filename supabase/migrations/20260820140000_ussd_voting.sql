-- ABCOSSA: USSD Voting Integration (Hubtel *713#)

-- 1. Add nominee_code column to nominees table if not exists
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'nominees' and column_name = 'nominee_code'
  ) then
    alter table public.nominees add column nominee_code text;
    create index if not exists idx_nominees_code on public.nominees(nominee_code);
  end if;
end $$;

-- 2. Seed default Hubtel USSD settings in site_settings
insert into public.site_settings (key, value) values
  ('ussd_provider', 'hubtel'),
  ('ussd_shortcode', '*713*22#'),
  ('ussd_event_code', '22'),
  ('ussd_enabled', 'true'),
  ('ussd_instructions', '1. Dial the USSD code on any network (MTN, Telecel, AT)\n2. Enter Candidate Code\n3. Enter Number of Votes\n4. Authorize Mobile Money PIN prompt')
on conflict (key) do update set
  value = excluded.value
where site_settings.key in ('ussd_provider', 'ussd_shortcode');

-- 3. Backfill sequential nominee codes (101, 102...) for existing nominees with null code
with numbered_nominees as (
  select id, row_number() over (order by created_at, id) as rn
  from public.nominees
  where nominee_code is null or nominee_code = ''
)
update public.nominees n
set nominee_code = (100 + nn.rn)::text
from numbered_nominees nn
where n.id = nn.id;
