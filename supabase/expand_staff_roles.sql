-- Expand supported staff roles for profile records and admin-style access helpers.
--
-- Run this in the Supabase SQL editor if your project still uses the older:
--   role in ('admin', 'manager', 'employee')
-- constraint from the base schema.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'ceo', 'cto', 'cfo', 'manager', 'employee'));

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
