-- Adds the pending state used by the Payroll queue. Run after 001-005.
alter table public.payment_runs drop constraint if exists payment_runs_status_check;
alter table public.payment_runs add constraint payment_runs_status_check check (status in ('pending', 'completed', 'reversed'));
