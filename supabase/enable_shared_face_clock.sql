-- Shared Face Clock support
--
-- Run this after the base schema and after supabase/fix_recursive_profiles_rls.sql.
-- It adds the profile and punch fields needed for a kiosk-style face clock flow.

alter table public.profiles
  add column if not exists company_name text,
  add column if not exists face_reference jsonb;

alter table public.punches
  add column if not exists device_name text,
  add column if not exists ip_address text,
  add column if not exists network_name text,
  add column if not exists verification_method text;

update public.profiles as p
set
  company_name = coalesce(p.company_name, u.raw_user_meta_data ->> 'company_name'),
  face_reference = coalesce(p.face_reference, u.raw_user_meta_data -> 'face_reference')
from auth.users as u
where u.id = p.id;

create policy "Authenticated users see all profiles"
on public.profiles
for select
using (auth.role() = 'authenticated');

create policy "Authenticated users create punches"
on public.punches
for insert
with check (auth.role() = 'authenticated');
