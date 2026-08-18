-- Production hardening migration for licensed tablet/kiosk deployments.
-- Run after the existing schema and the shared-clock migration.

create extension if not exists pgcrypto;

alter table public.punches add column if not exists client_event_id text;
create unique index if not exists punches_client_event_id_idx on public.punches(client_event_id) where client_event_id is not null;
alter table public.profiles add column if not exists company_name text;
alter table public.punches add column if not exists shift_type text check (shift_type in ('morning', 'evening'));
alter table public.punches add column if not exists shift_date date;
create table if not exists public.system_settings (id text primary key, settings jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
insert into public.system_settings (id, settings) values ('default', '{}'::jsonb) on conflict (id) do nothing;

create table if not exists public.employee_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,
  week_start date not null default date_trunc('week', current_date)::date,
  weekday smallint not null check (weekday between 0 and 6),
  shift_type text not null default 'morning' check (shift_type in ('morning', 'evening', 'off')),
  start_time time not null default '00:00',
  end_time time not null default '23:59',
  created_at timestamptz not null default now(),
  check ((user_id is not null) <> (member_id is not null))
);

alter table public.employee_schedules add column if not exists member_id uuid references public.members(id) on delete cascade;
alter table public.employee_schedules add column if not exists week_start date not null default date_trunc('week', current_date)::date;
alter table public.employee_schedules alter column user_id drop not null;
alter table public.employee_schedules drop constraint if exists employee_schedules_user_id_weekday_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'employee_schedules_one_subject_check') then
    alter table public.employee_schedules add constraint employee_schedules_one_subject_check check ((user_id is not null) <> (member_id is not null));
  end if;
end $$;
create unique index if not exists employee_schedules_user_week_day_idx on public.employee_schedules(user_id, week_start, weekday);
create unique index if not exists employee_schedules_member_week_day_idx on public.employee_schedules(member_id, week_start, weekday);

insert into public.employee_schedules (user_id, week_start, weekday, shift_type, start_time, end_time)
select p.id, date_trunc('week', current_date)::date, days.weekday, 'morning', '00:00'::time, '23:59'::time
from public.profiles p
cross join generate_series(0, 6) as days(weekday)
on conflict do nothing;

create or replace function public.close_expired_shift_sessions()
returns integer language plpgsql security definer set search_path = public as $$
declare punch_row record; schedule_row record; shift_end timestamptz; local_punch timestamp; company_timezone text; closed_count integer := 0;
begin
  select coalesce(settings->'general'->>'timezone', 'UTC') into company_timezone from public.system_settings where id = 'default';
  company_timezone := coalesce(company_timezone, 'UTC');
  for punch_row in
    select distinct on (p.user_id) p.* from public.punches p order by p.user_id, p.timestamp desc
  loop
    if punch_row.type <> 'in' then continue; end if;
    select * into schedule_row from public.employee_schedules
      where user_id = punch_row.user_id
        and week_start = date_trunc('week', (punch_row.timestamp at time zone company_timezone))::date
        and weekday = extract(dow from (punch_row.timestamp at time zone company_timezone))::integer;
    if schedule_row.id is null or schedule_row.shift_type = 'off' then continue; end if;
    if schedule_row.shift_type = 'evening' then
      local_punch := punch_row.timestamp at time zone company_timezone;
      shift_end := (((local_punch::date + 1) + schedule_row.end_time) at time zone company_timezone);
    else
      local_punch := punch_row.timestamp at time zone company_timezone;
      shift_end := (((local_punch::date + 1)::timestamp) - interval '1 second') at time zone company_timezone;
    end if;
    if now() > shift_end and not exists (
      select 1 from public.punches existing where existing.user_id = punch_row.user_id
        and existing.type = 'out' and existing.timestamp > punch_row.timestamp
        and existing.note like '%AUTO: did_not_clock_out%'
    ) then
      insert into public.punches (user_id, type, timestamp, shift_type, shift_date, note)
      values (punch_row.user_id, 'out', shift_end, schedule_row.shift_type,
        (punch_row.timestamp at time zone company_timezone)::date, 'AUTO: did_not_clock_out');
      closed_count := closed_count + 1;
    end if;
  end loop;
  return closed_count;
end; $$;
grant execute on function public.close_expired_shift_sessions() to authenticated;

-- Some installations do not have the role helper from the earlier RLS
-- migration. Define it here so this production migration is self-contained.
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

create table if not exists public.registered_devices (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  name text not null default 'Attendance device',
  device_type text not null default 'browser',
  user_agent text,
  status text not null default 'active' check (status in ('active','revoked')),
  registered_by uuid references auth.users(id) on delete set null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null default auth.uid(),
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text not null unique,
  plan text not null default 'standard',
  status text not null default 'active' check (status in ('active','suspended','expired')),
  organization_name text,
  expires_at timestamptz,
  max_devices integer not null default 5,
  activated_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.validate_current_license()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result public.licenses%rowtype;
begin
  select l.* into result from public.licenses l
  left join public.profiles p on p.id = auth.uid()
  where l.status = 'active'
    and (l.expires_at is null or l.expires_at > now())
    and (l.activated_by = auth.uid() or (l.organization_name is not null and l.organization_name = p.company_name))
  order by l.expires_at nulls first limit 1;
  if result.id is null then return jsonb_build_object('active', false, 'message', 'An active software license is required.', 'expiresAt', null, 'plan', null); end if;
  return jsonb_build_object('active', true, 'message', 'License active', 'expiresAt', result.expires_at, 'plan', result.plan);
end; $$;

create or replace function public.activate_license(license_key_input text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result public.licenses%rowtype; org_name text;
begin
  select company_name into org_name from public.profiles where id = auth.uid();
  select * into result from public.licenses where license_key = trim(license_key_input) for update;
  if result.id is null then raise exception 'License key is invalid.'; end if;
  if result.status <> 'active' or (result.expires_at is not null and result.expires_at <= now()) then raise exception 'License is inactive or expired.'; end if;
  update public.licenses set activated_by = auth.uid(), activated_at = now(), organization_name = coalesce(organization_name, org_name) where id = result.id;
  return jsonb_build_object('active', true, 'message', 'License activated', 'expiresAt', result.expires_at, 'plan', result.plan);
end; $$;
grant execute on function public.validate_current_license() to authenticated;
grant execute on function public.activate_license(text) to authenticated;

create or replace function public.has_active_license()
returns boolean language sql stable security definer set search_path = public as $$
  select (public.validate_current_license()->>'active')::boolean;
$$;
grant execute on function public.has_active_license() to authenticated;

alter table public.registered_devices enable row level security;
alter table public.audit_logs enable row level security;
alter table public.licenses enable row level security;
alter table public.employee_schedules enable row level security;

drop policy if exists "Authenticated users see all profiles" on public.profiles;
drop policy if exists "Authenticated users create punches" on public.punches;
drop policy if exists "Users manage own punches" on public.punches;
drop policy if exists "Managers create punches" on public.punches;
drop policy if exists "Managers update punches" on public.punches;
drop policy if exists "Users manage own licensed punches" on public.punches;
drop policy if exists "Managers create licensed punches" on public.punches;
drop policy if exists "Managers update licensed punches" on public.punches;
create policy "Users manage own licensed punches" on public.punches for all to authenticated using (auth.uid() = user_id and public.has_active_license()) with check (auth.uid() = user_id and public.has_active_license());
create policy "Managers create licensed punches" on public.punches for insert to authenticated with check (public.is_admin_or_manager() and public.has_active_license());
create policy "Managers update licensed punches" on public.punches for update to authenticated using (public.is_admin_or_manager() and public.has_active_license()) with check (public.is_admin_or_manager() and public.has_active_license());

drop policy if exists "Users register devices" on public.registered_devices;
drop policy if exists "Managers view devices" on public.registered_devices;
drop policy if exists "Managers manage devices" on public.registered_devices;
create policy "Users register devices" on public.registered_devices for insert to authenticated with check (registered_by = auth.uid() or registered_by is null);
create policy "Managers view devices" on public.registered_devices for select to authenticated using (public.is_admin_or_manager());
create policy "Managers manage devices" on public.registered_devices for update to authenticated using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());

drop policy if exists "Users create audit events" on public.audit_logs;
drop policy if exists "Managers view audit events" on public.audit_logs;
drop policy if exists "Users activate licenses" on public.licenses;
drop policy if exists "Managers manage licenses" on public.licenses;
create policy "Users create audit events" on public.audit_logs for insert to authenticated with check (actor_id = auth.uid());
create policy "Managers view audit events" on public.audit_logs for select to authenticated using (public.is_admin_or_manager());
create policy "Users activate licenses" on public.licenses for select to authenticated using (activated_by = auth.uid() or organization_name = (select company_name from public.profiles where id = auth.uid()));
create policy "Managers manage licenses" on public.licenses for update to authenticated using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());

drop policy if exists "Users read own schedules" on public.employee_schedules;
drop policy if exists "Managers read schedules" on public.employee_schedules;
drop policy if exists "Managers manage schedules" on public.employee_schedules;
create policy "Users read own schedules" on public.employee_schedules for select to authenticated using (user_id = auth.uid());
create policy "Managers read schedules" on public.employee_schedules for select to authenticated using (public.is_admin_or_manager());
create policy "Managers manage schedules" on public.employee_schedules for all to authenticated using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());

create or replace function public.prevent_self_role_elevation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_admin_or_manager() then
    raise exception 'Only administrators can change roles.';
  end if;
  return new;
end; $$;
drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role before update on public.profiles for each row execute function public.prevent_self_role_elevation();

-- Members and member entries are kiosk-managed data and must not be globally public.
drop policy if exists "Authenticated users can read members" on public.members;
drop policy if exists "Authenticated users can create members" on public.members;
drop policy if exists "Authenticated users can update members" on public.members;
drop policy if exists "Managers read members" on public.members;
drop policy if exists "Managers manage members" on public.members;
drop policy if exists "Managers manage member entries" on public.member_entries;
create policy "Managers read members" on public.members for select to authenticated using (public.is_admin_or_manager());
create policy "Managers manage members" on public.members for all to authenticated using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());
create policy "Managers manage member entries" on public.member_entries for all to authenticated using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());
