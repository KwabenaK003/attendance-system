create table if not exists public.payment_run_sessions (
  id uuid primary key default gen_random_uuid(),
  payment_run_item_id uuid not null references public.payment_run_items(id) on delete cascade,
  punch_id uuid references public.punches(id) on delete cascade,
  member_entry_id uuid references public.member_entries(id) on delete cascade,
  constraint payment_run_sessions_one_source check (
    (punch_id is not null and member_entry_id is null) or
    (punch_id is null and member_entry_id is not null)
  )
);

create index if not exists idx_payment_run_sessions_item on public.payment_run_sessions(payment_run_item_id);
create index if not exists idx_payment_run_sessions_punch on public.payment_run_sessions(punch_id);
create index if not exists idx_payment_run_sessions_member_entry on public.payment_run_sessions(member_entry_id);
create unique index if not exists payment_run_sessions_one_punch on public.payment_run_sessions(punch_id) where punch_id is not null;
create unique index if not exists payment_run_sessions_one_member_entry on public.payment_run_sessions(member_entry_id) where member_entry_id is not null;

alter table public.punches add column if not exists payment_run_id uuid references public.payment_runs(id) on delete set null;
alter table public.punches add column if not exists paid_at timestamptz;
alter table public.member_entries add column if not exists payment_run_id uuid references public.payment_runs(id) on delete set null;
alter table public.member_entries add column if not exists paid_at timestamptz;

create index if not exists idx_punches_payment_run on public.punches(payment_run_id);
create index if not exists idx_member_entries_payment_run on public.member_entries(payment_run_id);

alter table public.payment_runs enable row level security;
alter table public.payment_run_items enable row level security;
alter table public.payment_run_sessions enable row level security;

drop policy if exists "Managers manage payment runs" on public.payment_runs;
drop policy if exists "Managers manage payment run items" on public.payment_run_items;
drop policy if exists "Managers manage payment run sessions" on public.payment_run_sessions;
create policy "Managers manage payment runs" on public.payment_runs for all to authenticated
  using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());
create policy "Managers manage payment run items" on public.payment_run_items for all to authenticated
  using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());
create policy "Managers manage payment run sessions" on public.payment_run_sessions for all to authenticated
  using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());