create table if not exists public.payment_run_items (
  id uuid primary key default gen_random_uuid(),
  payment_run_id uuid not null references public.payment_runs(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  regular_hours numeric(8, 2) not null default 0,
  overtime_hours numeric(8, 2) not null default 0,
  rate numeric(10, 2) not null,
  amount numeric(12, 2) not null,
  constraint payment_run_items_one_person check (
    (member_id is not null and profile_id is null) or
    (member_id is null and profile_id is not null)
  )
);

create index if not exists idx_payment_run_items_run_id on public.payment_run_items(payment_run_id);
create index if not exists idx_payment_run_items_member_id on public.payment_run_items(member_id);
create index if not exists idx_payment_run_items_profile_id on public.payment_run_items(profile_id);