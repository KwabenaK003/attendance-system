-- Returns one payment-ready row for every employee or member with completed,
-- unpaid attendance. The calculation is kept in the database so browser UI
-- cannot accidentally calculate a different amount from payroll history.
--
-- Regular time is the first 8 hours for each person on each local work date.
-- Remaining completed time for that date is overtime at 2.0x the hourly rate.
-- PostgreSQL cannot change a function's OUT/return columns with CREATE OR
-- REPLACE. Drop this no-argument function first so this script can also
-- upgrade an earlier version of the payroll function.
drop function if exists public.get_pending_payments();

create or replace function public.get_pending_payments()
returns table (
  person_kind text,
  person_id uuid,
  person_name text,
  person_role text,
  employment_status text,
  hourly_rate numeric,
  regular_minutes integer,
  overtime_minutes integer,
  regular_amount numeric,
  overtime_amount numeric,
  total_amount numeric,
  sessions jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  company_timezone text;
begin
  if not public.is_admin_or_manager() then
    raise exception 'Only managers can view pending payroll payments.';
  end if;

  select coalesce(settings->'general'->>'timezone', 'UTC')
  into company_timezone
  from public.system_settings
  where id = 'default';
  company_timezone := coalesce(company_timezone, 'UTC');

  return query
  with ordered_punches as (
    select
      p.id as punch_in_id,
      p.user_id as person_id,
      p.timestamp as clock_in,
      p.payment_run_id as punch_in_payment_run_id,
      lead(p.id) over (partition by p.user_id order by p.timestamp, p.created_at) as punch_out_id,
      lead(p.type) over (partition by p.user_id order by p.timestamp, p.created_at) as next_type,
      lead(p.timestamp) over (partition by p.user_id order by p.timestamp, p.created_at) as clock_out,
      lead(p.payment_run_id) over (partition by p.user_id order by p.timestamp, p.created_at) as punch_out_payment_run_id,
      p.type
    from public.punches p
  ),
  completed_sessions as (
    select
      'employee'::text as person_kind,
      op.person_id,
      coalesce(profile.full_name, 'Employee') as person_name,
      coalesce(profile.role, 'employee') as person_role,
      'full_time'::text as employment_status,
      coalesce(profile.hourly_rate, 0)::numeric as hourly_rate,
      op.clock_in as started_at,
      greatest(0, floor(extract(epoch from (op.clock_out - op.clock_in)) / 60))::integer as minutes,
      jsonb_build_object(
        'source', 'employee',
        'punchInId', op.punch_in_id,
        'punchOutId', op.punch_out_id,
        'clockIn', op.clock_in,
        'clockOut', op.clock_out
      ) as session
    from ordered_punches op
    join public.profiles profile on profile.id = op.person_id
    where op.type = 'in'
      and op.next_type = 'out'
      and op.clock_out is not null
      and op.punch_in_payment_run_id is null
      and op.punch_out_payment_run_id is null

    union all

    select
      'member'::text,
      entry.member_id,
      coalesce(member.full_name, 'Member'),
      coalesce(member.role, 'employee'),
      case when member.employment_type = 'intern' then 'internship' else coalesce(member.employment_type, 'full_time') end,
      coalesce(member.hourly_rate, 0)::numeric,
      entry.punch_in,
      greatest(0, floor(extract(epoch from (entry.punch_out - entry.punch_in)) / 60))::integer,
      jsonb_build_object(
        'source', 'member',
        'entryId', entry.id,
        'clockIn', entry.punch_in,
        'clockOut', entry.punch_out
      )
    from public.member_entries entry
    join public.members member on member.id = entry.member_id
    where entry.punch_out is not null
      and entry.payment_run_id is null
  ),
  daily_running_total as (
    select
      session.*,
      (session.started_at at time zone company_timezone)::date as work_date,
      sum(session.minutes) over (
        partition by session.person_kind, session.person_id, (session.started_at at time zone company_timezone)::date
        order by session.started_at
        rows between unbounded preceding and current row
      ) as running_minutes
    from completed_sessions session
    where session.minutes > 0
  ),
  allocated_sessions as (
    select
      *,
      least(minutes, greatest(0, 480 - (running_minutes - minutes)))::integer as regular_session_minutes,
      greatest(0, minutes - least(minutes, greatest(0, 480 - (running_minutes - minutes))))::integer as overtime_session_minutes
    from daily_running_total
  ),
  person_totals as (
    select
      allocated.person_kind,
      allocated.person_id,
      max(allocated.person_name) as person_name,
      max(allocated.person_role) as person_role,
      max(allocated.employment_status) as employment_status,
      max(allocated.hourly_rate) as hourly_rate,
      sum(allocated.regular_session_minutes)::integer as regular_minutes,
      sum(allocated.overtime_session_minutes)::integer as overtime_minutes,
      jsonb_agg(
        allocated.session || jsonb_build_object(
          'regularMinutes', allocated.regular_session_minutes,
          'overtimeMinutes', allocated.overtime_session_minutes
        ) order by allocated.started_at
      ) as sessions
    from allocated_sessions allocated
    group by allocated.person_kind, allocated.person_id
  )
  select
    totals.person_kind,
    totals.person_id,
    totals.person_name,
    totals.person_role,
    totals.employment_status,
    totals.hourly_rate,
    totals.regular_minutes,
    totals.overtime_minutes,
    round((totals.regular_minutes::numeric / 60) * totals.hourly_rate, 2) as regular_amount,
    round((totals.overtime_minutes::numeric / 60) * totals.hourly_rate * 2.00, 2) as overtime_amount,
    round(
      ((totals.regular_minutes::numeric / 60) * totals.hourly_rate)
      + ((totals.overtime_minutes::numeric / 60) * totals.hourly_rate * 2.00),
      2
    ) as total_amount,
    totals.sessions
  from person_totals totals
  order by totals.person_name;
end;
$$;

grant execute on function public.get_pending_payments() to authenticated;
