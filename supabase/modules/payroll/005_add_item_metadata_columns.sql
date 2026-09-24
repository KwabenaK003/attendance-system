alter table public.payment_run_items add column if not exists employment_status text;
alter table public.payment_run_items add column if not exists person_role text;
alter table public.payment_run_items add column if not exists note text;