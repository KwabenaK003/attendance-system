# Attendance Management

A full-featured time tracking web application built with React, Tailwind CSS, Vite, and Supabase.

## Features
- 🕐 **Clock In/Out** with GPS geolocation capture
- 📊 **Dashboard** with live stats and weekly chart
- 🗂️ **Timesheets** — monthly view with CSV export
- 🌴 **Leave Requests** — request and approve/reject time off
- 📁 **Project Time Tracking** — track billable hours per project
- 📈 **Reports & Analytics** — monthly trends, day-of-week analysis
- 👥 **Employee Management** — admin panel to manage roles, departments, rates
- 🔐 **Role-Based Access** — admin, manager, employee roles via Supabase RLS

## Setup

### 1. Create a Supabase project at https://supabase.com

### 2. Run the SQL schema
Open `src/lib/supabase.js` and copy the SQL schema from the comments. Run it in your Supabase SQL editor.

If you already ran the older policies and see `infinite recursion detected in policy for relation "profiles"`, also run:
`supabase/fix_recursive_profiles_rls.sql`

For the Settings page, also run:
`supabase/create_system_settings.sql`

### 3. Configure environment variables
Create a `.env` file in the project root:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_PUBLIC_APP_URL=https://your-deployed-app.example.com
```

`VITE_PUBLIC_APP_URL` is optional, but recommended in production so copied leave request and shared clock links use your deployed URL instead of the current browser origin.

### 4. Install dependencies and run
```bash
npm install
npm run dev
```

### 5. Build for production
```bash
npm run build
npm run preview
```

## Email delivery with Resend

The **Email/SMTP** Settings tab sends test emails through Resend. The Resend API
key is stored as a Supabase Edge Function secret and is never exposed to the
browser or saved in `system_settings`.

1. Create a Resend account, verify the domain you will send from, and create an API key.
2. Copy `supabase/functions/.env.example` to `supabase/functions/.env` and add the real key.
3. From this project directory, set the secret and deploy the function:

```bash
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy send-test-email
```

4. Sign in as a manager or administrator. In **Settings → Email/SMTP**, enter a
verified **From Email Address**, save, and use **Send Test Email**.

Only manager and administrator roles can invoke the email function.

## Tablet kiosk deployment

The application is installable as a PWA on Android tablets. Open the deployed URL in Chrome, sign in with a management account, open `/clock/station?mode=kiosk`, and use **Install app** from the browser menu. The kiosk route is restricted to management roles and registers the tablet as a device.

Before enabling production use, run `supabase/production_hardening.sql` after the existing Supabase migrations. This creates license, device, and audit tables, adds offline punch deduplication, protects role changes, and applies license-aware punch policies. Insert the customer license key into `public.licenses`, then activate it from `/license`.

The same migration creates the week-specific employee/member schedule table. Administrators choose a person and week from **Schedules**, then assign each day manually: morning shifts run from 00:00 through 23:59, while evening shifts run from 18:00 through 12:00 the following day. Expired open punches are closed with `AUTO: did_not_clock_out` and appear as **Did not clock out** in the Attendance Log.

Offline employee punches are stored in the tablet's IndexedDB and synchronized when the connection returns. Member punches still require connectivity because they update an existing member session record.

## Tech Stack
- **Frontend**: React 18, React Router v6
- **Styling**: Tailwind CSS v4, custom design system
- **Backend**: Supabase (Auth, PostgreSQL, Row Level Security)
- **Charts**: Recharts
- **Icons**: Lucide React
- **Date handling**: date-fns
- **Build**: Vite

## Database Schema
Tables: `profiles`, `punches`, `leave_requests`, `projects`, `project_entries`
All tables protected by Row Level Security (RLS) policies.
