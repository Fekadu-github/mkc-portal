# Meserete Kristos Church — Amanuel Local Church
## Final Church Management Platform v12

### Included
- Public church website
- Private Church Management Portal
- Role-based portal navigation
- People/member database
- Automatic age and age-group calculation
- Family/household grouping
- Department management
- Attendance records
- Events
- Follow-up/pastoral-care cases
- Reports and CSV export
- User/permission overview
- Mobile responsive interface
- Period Report export to Excel (.xlsx): events (date, department, issue) and follow-up cases (open and closed) for the selected period
- Member profile editing and printable member card
- Emergency contact and address fields
- Membership/baptism information fields
- Data-governance guidance

### Demo accounts
- Super Admin: `admin` / `admin123`
- Secretary: `secretary` / `secretary123`
- Youth: `youth` / `youth123`
- Children: `children` / `children123`

These are prototype credentials only. Change/remove them before real deployment.

### Production deployment
1. Create a Supabase project.
2. Run `supabase/schema.sql`.
3. Configure authentication users and roles.
4. Replace browser/Supabase/PostgreSQL demo persistence with Supabase API calls.
5. Enable Row Level Security (RLS) for every member, family, attendance, event and follow-up table.
6. Enable HTTPS, backups, MFA for administrators and audit logging.
7. Never put real member data into the demo/Supabase/PostgreSQL version.
8. Configure `.env` from `.env.example` and keep secrets out of the public website repository.

### Recommended operational roles
Super Admin, Church Secretary, Pastor/Leadership, Youth, Children, Women, Men, Teaching & Training, Evangelism & Shepherding, Worship & Choir, Sunday School, Prayer, Finance.

### Suggested age groups
Children: 0–12
Youth: 13–24
Adult: 25–59
Senior: 60+

The age is calculated from date of birth so it does not need annual manual updates.


## v12 security implementation
- Supabase Auth email/password sign-in
- TOTP MFA enrollment/challenge/verification in the portal
- PostgreSQL Row-Level Security policies by role and department
- Database audit triggers for application tables
- Public/anon browser key only; service-role secrets excluded
- Backup and recovery procedure in `BACKUP_AND_RECOVERY.md`
- Supabase setup procedure in `SUPABASE_V12_SETUP.md`
