-- One immutable payroll line per person in a manual payment run. Amounts and
-- rates are snapshots, so later rate changes never rewrite payment history.
create table if not exists public.payment_run_items (
  id uuid primary key default gen_random_uuid(),
  payment_run_id uuid not null references public.payment_runs(id) on delete cascade,
  person_kind text not null check (person_kind in ('employee', 'member')),
  person_id uuid not null,
  person_name text not null,
  person_role text,
  employment_status text check (employment_status in ('full_time', 'part_time', 'contract', 'internship')),
  hourly_rate numeric(12, 2) not null default 0,
  regular_minutes integer not null default 0 check (regular_minutes >= 0),
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  overtime_multiplier numeric(4, 2) not null default 2.00 check (overtime_multiplier >= 1),
  regular_amount numeric(12, 2) not null default 0,
  overtime_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  payment_reference text,
  note text,
  created_at timestamptz not null default now(),
  unique(payment_run_id, person_kind, person_id)
);

create index if not exists idx_payment_run_items_run on public.payment_run_items(payment_run_id);
create index if not exists idx_payment_run_items_person on public.payment_run_items(person_kind, person_id);

alter table public.payment_run_items add column if not exists person_role text;
alter table public.payment_run_items add column if not exists employment_status text;
alter table public.payment_run_items add column if not exists note text;
