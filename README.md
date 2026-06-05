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
