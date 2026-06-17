-- Enable pgcrypto for password hashing if it is not already enabled
create extension if not exists pgcrypto;

-- SECURITY DEFINER function to delete a user by ID (cascades to profiles)
create or replace function public.delete_user_by_admin(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Check if caller is admin
  if not public.is_admin_or_manager() then
    raise exception 'Only administrators can delete users.';
  end if;

  -- Prevent self-deletion
  if auth.uid() = target_user_id then
    raise exception 'You cannot delete your own admin account.';
  end if;

  -- Delete from auth.users (cascades to profiles)
  delete from auth.users where id = target_user_id;
end;
$$;

-- SECURITY DEFINER function to update user metadata, email, and password
create or replace function public.update_user_by_admin(
  target_user_id uuid,
  next_full_name text,
  next_email text,
  next_password text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Check if caller is admin
  if not public.is_admin_or_manager() then
    raise exception 'Only administrators can update users.';
  end if;

  -- Update auth.users email and metadata
  update auth.users
  set email = next_email,
      raw_user_meta_data = raw_user_meta_data || jsonb_build_object('full_name', next_full_name),
      updated_at = now()
  where id = target_user_id;

  -- Update password if provided
  if next_password is not null and next_password <> '' then
    update auth.users
    set encrypted_password = crypt(next_password, gen_salt('bf'))
    where id = target_user_id;
  end if;

  -- Update profiles full_name
  update public.profiles
  set full_name = next_full_name
  where id = target_user_id;
end;
$$;
