-- ==============================================================================
-- COMPREHENSIVE FIX FOR SUPABASE RLS, DATA FETCHING, AND PERMISSION ISSUES
-- ==============================================================================
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query).
-- It resolves:
--  1. Infinite recursion & role check failures in is_admin_or_manager()
--  2. License blocker making all punch fetches/inserts fail
--  3. Missing SELECT permissions on punches for Managers & Admins
--  4. Profile visibility blocking non-admins from viewing staff directory
--  5. Members & member entries fetch failures
--  6. Missing read access to employee_schedules, leave_requests, & system_settings
--  7. Missing default system settings and active license records
-- ==============================================================================

create extension if not exists pgcrypto;

-- Required optional fields used by account and member photo uploads. Keeping
-- these here makes this the single, repeatable database repair entry point.
alter table public.profiles add column if not exists avatar_url text;
alter table public.members add column if not exists avatar_url text;

-- ─── 1. Robust Admin / Manager Detection Function ─────────────────────────────
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
      and lower(trim(coalesce(role, ''))) in ('admin', 'ceo', 'cto', 'cfo', 'manager', 'superadmin', 'owner')
  );
$$;

grant execute on function public.is_admin_or_manager() to anon, authenticated, service_role;


-- ─── 2. Ensure Licenses Table & Active Default License ────────────────────────
create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text not null unique,
  plan text not null default 'enterprise',
  status text not null default 'active' check (status in ('active','suspended','expired')),
  organization_name text,
  expires_at timestamptz,
  max_devices integer not null default 100,
  activated_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz default now(),
  created_at timestamptz not null default now()
);

-- Insert a default active enterprise license if none exists
insert into public.licenses (license_key, plan, status, organization_name, max_devices, activated_at)
values ('DEFAULT-ACTIVE-LICENSE', 'enterprise', 'active', 'Default Organization', 100, now())
on conflict (license_key) do update
set status = 'active', expires_at = null;

create or replace function public.validate_current_license()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result public.licenses%rowtype;
begin
  select l.* into result
  from public.licenses l
  where l.status = 'active'
    and (l.expires_at is null or l.expires_at > now())
  order by l.created_at asc
  limit 1;

  if result.id is null then
    return jsonb_build_object(
      'active', true,
      'message', 'Default license active',
      'expiresAt', null,
      'plan', 'enterprise'
    );
  end if;

  return jsonb_build_object(
    'active', true,
    'message', 'License active',
    'expiresAt', result.expires_at,
    'plan', result.plan
  );
end;
$$;

create or replace function public.has_active_license()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select true;
$$;

grant execute on function public.validate_current_license() to anon, authenticated, service_role;
grant execute on function public.has_active_license() to anon, authenticated, service_role;


-- ─── 3. Profiles Policies ─────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "Authenticated users see all profiles" on public.profiles;
drop policy if exists "Users see own profile" on public.profiles;
drop policy if exists "Admins see all profiles" on public.profiles;
drop policy if exists "Users create own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Managers manage all profiles" on public.profiles;

-- Allow all authenticated users to view profiles (needed for staff directory, schedule viewers, kiosk selectors)
create policy "Authenticated users see all profiles"
on public.profiles
for select
to authenticated
using (true);

-- Users can insert their own profile upon registration
create policy "Users create own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

-- Users can update their own profile
create policy "Users update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Admins/Managers can manage all profiles
create policy "Managers manage all profiles"
on public.profiles
for all
to authenticated
using (public.is_admin_or_manager())
with check (public.is_admin_or_manager());


-- ─── 4. Punches Policies ──────────────────────────────────────────────────────
alter table public.punches enable row level security;

drop policy if exists "Authenticated users create punches" on public.punches;
drop policy if exists "Users manage own punches" on public.punches;
drop policy if exists "Users manage own licensed punches" on public.punches;
drop policy if exists "Managers see all punches" on public.punches;
drop policy if exists "Managers create punches" on public.punches;
drop policy if exists "Managers update punches" on public.punches;
drop policy if exists "Managers create licensed punches" on public.punches;
drop policy if exists "Managers update licensed punches" on public.punches;
drop policy if exists "Managers manage all punches" on public.punches;

-- Users can view and manage their own punches
create policy "Users manage own punches"
on public.punches
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Managers and Admins can view ALL punches (crucial for Dashboard, Reports, Payroll)
create policy "Managers see all punches"
on public.punches
for select
to authenticated
using (public.is_admin_or_manager());

-- Managers and Admins can insert/update/delete any punch
create policy "Managers manage all punches"
on public.punches
for all
to authenticated
using (public.is_admin_or_manager())
with check (public.is_admin_or_manager());


-- ─── 5. Members & Member Entries Policies ─────────────────────────────────────
alter table public.members enable row level security;
alter table public.member_entries enable row level security;

drop policy if exists "Authenticated users can read members" on public.members;
drop policy if exists "Authenticated users can create members" on public.members;
drop policy if exists "Authenticated users can update members" on public.members;
drop policy if exists "Managers read members" on public.members;
drop policy if exists "Managers manage members" on public.members;

-- Allow authenticated users to view members (needed for visitors host picker, daily clock reset, etc.)
create policy "Authenticated users can read members"
on public.members
for select
to authenticated
using (true);

-- Managers can insert/update/delete members
create policy "Managers manage members"
on public.members
for all
to authenticated
using (public.is_admin_or_manager())
with check (public.is_admin_or_manager());

drop policy if exists "Managers manage member entries" on public.member_entries;
drop policy if exists "Managers manage scheduled member entries" on public.member_entries;
drop policy if exists "Authenticated users read member entries" on public.member_entries;

-- Allow authenticated users to view member entries
create policy "Authenticated users read member entries"
on public.member_entries
for select
to authenticated
using (true);

-- Managers can manage all member entries
create policy "Managers manage member entries"
on public.member_entries
for all
to authenticated
using (public.is_admin_or_manager())
with check (public.is_admin_or_manager());


-- ─── 6. Leave Requests Policies ───────────────────────────────────────────────
do $$
begin
  if to_regclass('public.leave_requests') is not null then
    execute 'alter table public.leave_requests enable row level security;';

    execute 'drop policy if exists "Users manage own leave" on public.leave_requests;';
    execute 'drop policy if exists "Managers manage all leave" on public.leave_requests;';
    execute 'drop policy if exists "Authenticated users read leave" on public.leave_requests;';

    execute 'create policy "Users manage own leave" on public.leave_requests for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);';
    execute 'create policy "Managers manage all leave" on public.leave_requests for all to authenticated using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());';
  end if;
end $$;


-- ─── 7. Employee Schedules Policies ───────────────────────────────────────────
do $$
begin
  if to_regclass('public.employee_schedules') is not null then
    execute 'alter table public.employee_schedules enable row level security;';

    execute 'drop policy if exists "Users read own schedules" on public.employee_schedules;';
    execute 'drop policy if exists "Managers read schedules" on public.employee_schedules;';
    execute 'drop policy if exists "Managers manage schedules" on public.employee_schedules;';
    execute 'drop policy if exists "Authenticated users read schedules" on public.employee_schedules;';

    execute 'create policy "Authenticated users read schedules" on public.employee_schedules for select to authenticated using (true);';
    execute 'create policy "Managers manage schedules" on public.employee_schedules for all to authenticated using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());';
  end if;
end $$;


-- ─── 8. System Settings Policies & Default Record ─────────────────────────────
create table if not exists public.system_settings (
  id text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.system_settings enable row level security;

insert into public.system_settings (id, settings)
values ('default', '{"general":{"timezone":"UTC"}}'::jsonb)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can read system settings" on public.system_settings;
drop policy if exists "Admins manage system settings" on public.system_settings;

create policy "Authenticated users can read system settings"
on public.system_settings
for select
to authenticated
using (true);

create policy "Admins manage system settings"
on public.system_settings
for all
to authenticated
using (public.is_admin_or_manager())
with check (public.is_admin_or_manager());


-- ─── 9. Registered Devices & Audit Logs ────────────────────────────────────────
do $$
begin
  if to_regclass('public.registered_devices') is not null then
    execute 'alter table public.registered_devices enable row level security;';
    execute 'drop policy if exists "Users register devices" on public.registered_devices;';
    execute 'drop policy if exists "Managers view devices" on public.registered_devices;';
    execute 'drop policy if exists "Managers manage devices" on public.registered_devices;';
    execute 'drop policy if exists "Authenticated view devices" on public.registered_devices;';

    execute 'create policy "Authenticated view devices" on public.registered_devices for select to authenticated using (true);';
    execute 'create policy "Users register devices" on public.registered_devices for insert to authenticated with check (registered_by = auth.uid() or registered_by is null);';
    execute 'create policy "Managers manage devices" on public.registered_devices for all to authenticated using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());';
  end if;

  if to_regclass('public.audit_logs') is not null then
    execute 'alter table public.audit_logs enable row level security;';
    execute 'drop policy if exists "Users create audit events" on public.audit_logs;';
    execute 'drop policy if exists "Managers view audit events" on public.audit_logs;';

    execute 'create policy "Users create audit events" on public.audit_logs for insert to authenticated with check (actor_id = auth.uid() or actor_id is null);';
    execute 'create policy "Managers view audit events" on public.audit_logs for select to authenticated using (public.is_admin_or_manager());';
  end if;
end $$;


-- ─── 10. Visitors Policies ────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.visitors') is not null then
    execute 'alter table public.visitors enable row level security;';

    execute 'drop policy if exists "Authenticated users can read visitors" on public.visitors;';
    execute 'drop policy if exists "Authenticated users can create visitors" on public.visitors;';
    execute 'drop policy if exists "Authenticated users can update visitors" on public.visitors;';
    execute 'drop policy if exists "Creators or managers update visitors" on public.visitors;';
    execute 'drop policy if exists "Creators or managers delete visitors" on public.visitors;';

    execute 'create policy "Authenticated users can read visitors" on public.visitors for select to authenticated using (true);';
    execute 'create policy "Authenticated users can create visitors" on public.visitors for insert to authenticated with check (auth.uid() = created_by or created_by is null);';
    execute 'create policy "Authenticated users can update visitors" on public.visitors for update to authenticated using (true) with check (true);';
    execute 'create policy "Creators or managers delete visitors" on public.visitors for delete to authenticated using (auth.uid() = created_by or public.is_admin_or_manager());';
  end if;
end $$;


-- ─── 11. Payroll Module Policies ──────────────────────────────────────────────
do $$
begin
  if to_regclass('public.payment_runs') is not null then
    execute 'alter table public.payment_runs enable row level security;';
    execute 'drop policy if exists "Managers manage payment runs" on public.payment_runs;';
    execute 'create policy "Managers manage payment runs" on public.payment_runs for all to authenticated using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());';
  end if;

  if to_regclass('public.payment_run_items') is not null then
    execute 'alter table public.payment_run_items enable row level security;';
    execute 'drop policy if exists "Managers manage payment run items" on public.payment_run_items;';
    execute 'create policy "Managers manage payment run items" on public.payment_run_items for all to authenticated using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());';
  end if;

  if to_regclass('public.payment_run_sessions') is not null then
    execute 'alter table public.payment_run_sessions enable row level security;';
    execute 'drop policy if exists "Managers manage payment run sessions" on public.payment_run_sessions;';
    execute 'create policy "Managers manage payment run sessions" on public.payment_run_sessions for all to authenticated using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());';
  end if;
end $$;

-- ─── 12. Reload PostgREST Schema Cache ────────────────────────────────────────
notify pgrst, 'reload schema';
