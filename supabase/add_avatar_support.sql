-- Profile photos are stored as small data URLs (the UI limits uploads to 1.5 MB).
-- Run once in the Supabase SQL editor before using profile-photo upload.
alter table public.profiles add column if not exists avatar_url text;
alter table public.members add column if not exists avatar_url text;
