# FINAL v12 — Meserete Kristos Church Amanuel Local Church Website + Secure Church Management Portal

# FINAL v12 — Meserete Kristos Church Amanuel Local Church Website & Church Management Portal

# Meserete Kristos Church — Amanuel Addis Ababa Local Church Website + Church Management Portal

## What was added in v9
This package now includes a private **Church Management Portal** at `portal.html`.

### Portal modules
- Dashboard and church statistics
- People & Members database
- Automatic age calculation and age groups
- Family / household grouping
- Department management
- Attendance
- Events
- Follow-up / pastoral care cases
- Reports and CSV export
- Users & permissions overview
- Responsive desktop/mobile interface
- Role-aware visibility for department users

### Demo users
- Super Admin: `admin` / `admin123`
- Secretary: `secretary` / `secretary123`
- Youth Department: `youth` / `youth123`
- Children Department: `children` / `children123`

**Important:** These demo credentials and browser `localStorage` are for prototype/testing only. Before real church member data is entered, connect the portal to a secure backend such as PostgreSQL/Supabase, implement server-side authentication and Row Level Security, HTTPS, encrypted backups, audit logging, password reset/MFA, and proper data retention/privacy controls.

## Recommended production database
PostgreSQL + Supabase is recommended for this project because it provides database, authentication, storage and row-level security capabilities. The portal UI is intentionally separated from the public website so member data is not exposed publicly.

## Suggested production tables
`users`, `roles`, `permissions`, `departments`, `people`, `families`, `family_members`, `attendance`, `events`, `event_registrations`, `follow_up_cases`, `ministries`, `audit_logs`, `documents`, and optionally `financial_transactions`.

## Run locally
Open `index.html` for the public website or `portal.html` for the private prototype.

## Next production step
Create the Supabase/PostgreSQL schema and replace browser storage/demo authentication with secure server-side authentication and department-level Row Level Security.

## v10 production database foundation
The `supabase/` folder contains the PostgreSQL schema, authentication profile trigger, role model and Row Level Security policies. `PRODUCTION_PLAN.md` describes the remaining production work.
