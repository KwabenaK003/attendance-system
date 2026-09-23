create extension if not exists pgcrypto;

create table if not exists public.payment_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null default current_date,
  payment_method text not null check (payment_method in ('bank_transfer', 'mobile_money', 'cash', 'other')),
  status text not null default 'completed' check (status in ('completed', 'reversed')),
  total_amount numeric(12, 2) not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_runs_created_at on public.payment_runs(created_at desc);
