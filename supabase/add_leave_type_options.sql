-- Leave request type expansion
--
-- Run this in the Supabase SQL editor if your existing leave_requests table
-- still uses the original four-value type check constraint.

alter table public.leave_requests
  drop constraint if exists leave_requests_type_check;

alter table public.leave_requests
  add constraint leave_requests_type_check
  check (type in ('sick', 'vacation', 'personal', 'maternal', 'study', 'other'));
