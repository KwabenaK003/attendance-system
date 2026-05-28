create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid()
);

alter table public.visitors
  add column if not exists full_name text,
  add column if not exists company_name text,
  add column if not exists purpose_of_visit text,
  add column if not exists host_member_id uuid,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists notes text,
  add column if not exists visit_date date default current_date,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.visitors
set
  full_name = coalesce(nullif(trim(full_name), ''), 'Unknown visitor'),
  purpose_of_visit = coalesce(nullif(trim(purpose_of_visit), ''), 'Visit'),
  visit_date = coalesce(visit_date, current_date),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where full_name is null
  or trim(full_name) = ''
  or purpose_of_visit is null
  or trim(purpose_of_visit) = ''
  or visit_date is null
  or created_at is null
  or updated_at is null;

alter table public.visitors
  alter column full_name set not null,
  alter column purpose_of_visit set not null,
  alter column visit_date set not null,
  alter column visit_date set default current_date,
  alter column created_at set not null,
  alter column created_at set default now(),
  alter column updated_at set not null,
  alter column updated_at set default now();

do $$
begin
  if to_regclass('public.members') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'visitors_host_member_id_fkey'
        and conrelid = 'public.visitors'::regclass
    )
  then
    alter table public.visitors
      add constraint visitors_host_member_id_fkey
      foreign key (host_member_id)
      references public.members (id)
      on delete set null;
  end if;

  if to_regclass('public.profiles') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'visitors_created_by_fkey'
        and conrelid = 'public.visitors'::regclass
    )
  then
    alter table public.visitors
      add constraint visitors_created_by_fkey
      foreign key (created_by)
      references public.profiles (id)
      on delete set null;
  end if;
end $$;

create index if not exists visitors_created_at_idx on public.visitors (created_at desc);
create index if not exists visitors_host_member_id_idx on public.visitors (host_member_id);

alter table public.visitors enable row level security;

drop policy if exists "Authenticated users can read visitors" on public.visitors;
create policy "Authenticated users can read visitors"
on public.visitors
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can create visitors" on public.visitors;
create policy "Authenticated users can create visitors"
on public.visitors
for insert
to authenticated
with check (auth.uid() = created_by);

drop policy if exists "Creators or managers update visitors" on public.visitors;
create policy "Creators or managers update visitors"
on public.visitors
for update
to authenticated
using (auth.uid() = created_by or public.is_admin_or_manager())
with check (auth.uid() = created_by or public.is_admin_or_manager());

drop policy if exists "Creators or managers delete visitors" on public.visitors;
create policy "Creators or managers delete visitors"
on public.visitors
for delete
to authenticated
using (auth.uid() = created_by or public.is_admin_or_manager());

notify pgrst, 'reload schema';
