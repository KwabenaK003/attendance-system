create table if not exists public.system_settings (
  id text primary key
);

alter table public.system_settings
  add column if not exists settings jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

update public.system_settings
set
  settings = coalesce(settings, '{}'::jsonb),
  updated_at = coalesce(updated_at, now())
where settings is null
  or updated_at is null;

alter table public.system_settings
  alter column settings set not null,
  alter column settings set default '{}'::jsonb,
  alter column updated_at set not null,
  alter column updated_at set default now();

alter table public.system_settings enable row level security;

drop policy if exists "Authenticated users can read system settings" on public.system_settings;
create policy "Authenticated users can read system settings"
on public.system_settings
for select
to authenticated
using (true);

drop policy if exists "Admins manage system settings" on public.system_settings;
create policy "Admins manage system settings"
on public.system_settings
for all
to authenticated
using (public.is_admin_or_manager())
with check (public.is_admin_or_manager());

insert into public.system_settings (id, settings)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
