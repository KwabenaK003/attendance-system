-- Fix for: infinite recursion detected in policy for relation "profiles"
--
-- Why this happens:
-- The original policies query `profiles` from inside a policy on `profiles`,
-- for example:
--   exists (select 1 from profiles where id = auth.uid() and role in (...))
-- That makes Postgres re-evaluate the same policy recursively.
--
-- Run this in the Supabase SQL editor after the base schema.

drop policy if exists "Users create own profile" on public.profiles;
drop policy if exists "Users see own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Admins see all profiles" on public.profiles;

drop policy if exists "Users manage own punches" on public.punches;
drop policy if exists "Managers see all punches" on public.punches;

drop policy if exists "Users manage own leave" on public.leave_requests;
drop policy if exists "Managers manage all leave" on public.leave_requests;

drop policy if exists "All see projects" on public.projects;
drop policy if exists "Admins manage projects" on public.projects;

drop policy if exists "Users manage own entries" on public.project_entries;
drop policy if exists "Managers see all entries" on public.project_entries;

create or replace function public.is_admin_or_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'ceo', 'cto', 'cfo', 'manager')
  );
$$;

grant execute on function public.is_admin_or_manager() to authenticated;

create policy "Users create own profile"
on public.profiles
for insert
with check (auth.uid() = id);

create policy "Users see own profile"
on public.profiles
for select
using (auth.uid() = id);

create policy "Users update own profile"
on public.profiles
for update
using (auth.uid() = id);

create policy "Admins see all profiles"
on public.profiles
for select
using (public.is_admin_or_manager());

create policy "Users manage own punches"
on public.punches
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Managers see all punches"
on public.punches
for select
using (public.is_admin_or_manager());

create policy "Users manage own leave"
on public.leave_requests
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Managers manage all leave"
on public.leave_requests
for all
using (public.is_admin_or_manager())
with check (public.is_admin_or_manager());

create policy "All see projects"
on public.projects
for select
using (true);

create policy "Admins manage projects"
on public.projects
for all
using (public.is_admin_or_manager())
with check (public.is_admin_or_manager());

create policy "Users manage own entries"
on public.project_entries
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Managers see all entries"
on public.project_entries
for select
using (public.is_admin_or_manager());
