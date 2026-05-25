import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim();
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const SUPABASE_CONFIG_ERROR =
  !SUPABASE_URL || !SUPABASE_ANON_KEY
    ? "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local, then restart the Vite dev server."
    : null;

export function assertSupabaseConfigured() {
  if (SUPABASE_CONFIG_ERROR) {
    throw new Error(SUPABASE_CONFIG_ERROR);
  }
}

export const supabase = createClient(
  SUPABASE_URL ?? "https://placeholder.invalid",
  SUPABASE_ANON_KEY ?? "placeholder-anon-key"
);

export function createDetachedSupabaseClient() {
  return createClient(
    SUPABASE_URL ?? "https://placeholder.invalid",
    SUPABASE_ANON_KEY ?? "placeholder-anon-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

// ─── Supabase SQL Schema (run in Supabase SQL editor) ───────────────────────
// 
// -- Profiles table (extends auth.users)
// create table profiles (
//   id uuid references auth.users on delete cascade primary key,
//   full_name text,
//   role text default 'employee' check (role in ('admin','ceo','cto','cfo','manager','employee')),
//   department text,
//   company_name text,
//   face_reference jsonb,
//   hourly_rate numeric(10,2) default 0,
//   created_at timestamptz default now()
// );
//
// -- Company name and face enrollment should also be mirrored in profiles
// -- so the shared kiosk clock can verify the selected employee.
//
// -- Time punches
// create table punches (
//   id uuid default gen_random_uuid() primary key,
//   user_id uuid references profiles(id) on delete cascade,
//   type text check (type in ('in','out')),
//   timestamp timestamptz default now(),
//   latitude numeric(10,7),
//   longitude numeric(10,7),
//   location_name text,
//   device_name text,
//   ip_address text,
//   network_name text,
//   verification_method text,
//   note text,
//   created_at timestamptz default now()
// );
//
// -- Leave requests
// create table leave_requests (
//   id uuid default gen_random_uuid() primary key,
//   user_id uuid references profiles(id) on delete cascade,
//   type text check (type in ('sick','vacation','personal','other')),
//   start_date date not null,
//   end_date date not null,
//   hours numeric(5,2),
//   reason text,
//   status text default 'pending' check (status in ('pending','approved','rejected')),
//   approved_by uuid references profiles(id),
//   created_at timestamptz default now()
// );
//
// -- Row Level Security policies
// alter table profiles enable row level security;
// alter table punches enable row level security;
// alter table leave_requests enable row level security;
//
// -- IMPORTANT:
// -- Do not make a profiles policy query profiles directly inside its USING clause.
// -- That causes: infinite recursion detected in policy for relation "profiles"
// -- Run supabase/fix_recursive_profiles_rls.sql for the safe version below.
//
// create or replace function public.is_admin_or_manager()
// returns boolean
// language sql
// stable
// security definer
// set search_path = public
// as $$
//   select exists (
//     select 1 from public.profiles
//     where id = auth.uid() and role in ('admin', 'ceo', 'cto', 'cfo', 'manager')
//   );
// $$;
//
// create policy "Users create own profile" on profiles for insert with check (auth.uid() = id);
// create policy "Users see own profile" on profiles for select using (auth.uid() = id);
// create policy "Users update own profile" on profiles for update using (auth.uid() = id);
// create policy "Admins see all profiles" on profiles for select using (public.is_admin_or_manager());
// create policy "Users manage own punches" on punches for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
// create policy "Managers see all punches" on punches for select using (public.is_admin_or_manager());
// create policy "Users manage own leave" on leave_requests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
// create policy "Managers manage all leave" on leave_requests for all using (public.is_admin_or_manager()) with check (public.is_admin_or_manager());
