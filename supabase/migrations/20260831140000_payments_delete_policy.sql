-- Enable public/authenticated deletion on payments table for admin logs management
alter table if exists public.payments enable row level security;

drop policy if exists "payments_delete_public" on public.payments;
create policy "payments_delete_public" on public.payments for delete using (true);

grant delete on public.payments to anon, authenticated, service_role;
