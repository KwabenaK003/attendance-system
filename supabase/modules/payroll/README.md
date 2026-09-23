# Payroll module

Run these files in the Supabase SQL editor, one at a time, in this order:

1. `001_payment_runs.sql`
2. `002_payment_run_items.sql`
3. `003_payment_run_sessons.sql`
4. `004_get_pending_payments.sql`

The module requires the management-role helper created by
`supabase/production_hardening.sql`. Payroll is restricted to management users.

The Payroll page only logs payments already made outside the app. It never
initiates a bank transfer, mobile-money payment, or other transaction.

Calculation rules used by the page:

- Completed unpaid employee punch pairs and member entries are eligible. The
  `get_pending_payments()` database function performs this query.
- The first 8 hours per person per calendar day use the normal hourly rate.
- Time above 8 hours per person per day uses a 2.0× multiplier.
- On confirmation, the source attendance rows receive `payment_run_id` and
  `paid_at` references and are attached to an immutable payment-run item.
