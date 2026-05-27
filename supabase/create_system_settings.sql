create table if not exists public.system_settings (
  id text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

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
