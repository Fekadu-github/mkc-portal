# MKC Amanuel Church Management System — Production Plan

## Phase 1 — Database foundation (v10)
- PostgreSQL/Supabase schema
- Authentication profile model
- Departments and roles
- People and families
- Attendance
- Events and registration
- Follow-up
- Audit logs
- Row Level Security
- Automatic age and age-group calculation

## Phase 2 — Portal connection
Replace the prototype browser `localStorage` layer with Supabase Auth + database queries.

## Phase 3 — Security hardening
- MFA for administrators
- Password reset
- Session timeout
- Audit logging for create/update/delete operations
- Database backups
- Storage access policies
- Least-privilege roles
- Privacy/retention policy

## Phase 4 — Church operations
- Individual attendance instead of summary-only attendance
- SMS/email notifications
- Visitor registration
- Membership workflow
- Child/guardian consent records
- Printable membership cards
- Advanced reports

## Important
Do not import real member data into the current demo portal until the production authentication and database connection are enabled.
