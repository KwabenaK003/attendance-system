create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  company_name text,
  purpose_of_visit text not null,
  host_member_id uuid,
  phone text,
  email text,
  notes text,
  visit_date date not null default current_date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visitors_host_member_id_fkey
    foreign key (host_member_id)
    references public.members (id)
    on delete set null,
  constraint visitors_created_by_fkey
    foreign key (created_by)
    references public.profiles (id)
    on delete set null
);

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
