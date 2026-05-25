-- Members staff profile fields
--
-- Run this in the Supabase SQL editor if you want the Members page
-- to store company name, role, email, and face enrollment on the
-- public.members table.

alter table public.members
  add column if not exists company_name text,
  add column if not exists role text default 'employee'
    check (role in ('ceo', 'cto', 'cfo', 'manager', 'employee')),
  add column if not exists email text,
  add column if not exists face_reference jsonb;

update public.members
set role = coalesce(role, 'employee')
where role is null;
