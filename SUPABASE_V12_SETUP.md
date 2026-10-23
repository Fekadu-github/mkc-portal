# MKC Amanuel Church Portal v12 — Supabase Setup

## A. Create the project
1. Create a Supabase project for the Amanuel Local Church management system.
2. Open **SQL Editor**.
3. Run `supabase/schema_v12.sql` in one execution. It is safe to re-run on an existing v12 database and refreshes the role and department Row-Level Security policies.
   This step is required for the fixed access rules: super admins, secretaries, and pastors can see and edit all members and follow-up cases; department users can only see and edit records for members assigned to their department.

## Enable Super Admin user creation in the portal

The portal’s **Add User** button is visible only to Super Admins. It creates a user’s email/password account and assigns their role and department through a protected Edge Function; the service-role key is never exposed to the browser.

1. In Supabase, deploy an Edge Function named `admin-create-user` using the source in `supabase/admin-create-user.edge.ts` as its `index.ts` file. Using the Supabase CLI, create `supabase/functions/admin-create-user/`, copy that source to `index.ts`, then run `supabase functions deploy admin-create-user`.
2. Keep JWT verification enabled (the default). Do not add a service-role or secret key to `supabase-config.js`.
3. Sign in as a user whose `profiles.role` is `super_admin`. Open **Users & Permissions** → **Add User**, then enter the user’s name, email, temporary password, role, and—when needed—department.

The function independently verifies the caller’s profile is an active Super Admin before creating any account, so changing the browser UI cannot grant this permission.

## B. Configure the browser client
1. Open `supabase-config.js`.
2. Replace `YOUR_PROJECT` with the project URL from Supabase.
3. Replace `YOUR_PUBLIC_ANON_KEY` with the project's public/anon key.
4. Do **not** paste a service-role/secret key into this file.

The public/anon key is intentionally used with PostgreSQL Row-Level Security. RLS is the control that protects member records.

## C. Create the first administrator
1. In Supabase **Authentication → Users**, create the first administrator with email/password.
2. Copy that user's UUID.
3. In SQL Editor run:

```sql
update public.profiles
set role='super_admin', full_name='Church Administrator', active=true
where id='AUTH-USER-UUID';
```

## D. Create department users
Create the user in Supabase Authentication. The database trigger automatically creates a `profiles` row with the `viewer` role.

An administrator then assigns:
- `role = department_user`
- `department_id = <department UUID>`
- `active = true`

The portal will then restrict that user's people/attendance access through RLS.

## E. MFA
Each user can click the circular account avatar in the portal after login and choose the MFA setup flow. The portal uses Supabase Auth TOTP MFA and prompts for the authenticator code at sign-in when an enrolled factor is present.

For production, require MFA for all administrators, pastors and secretaries before they receive real member data access.

## F. RLS validation test
Create two test department users, for example Youth and Children. Confirm:
- Youth sees Youth records only.
- Children sees Children records only.
- Neither can modify another department's people.
- Viewer cannot write member records.
- Super Admin can manage all records.
- Only authorized administrators can read audit logs.

## G. Backups
Follow `BACKUP_AND_RECOVERY.md`. Configure managed backups/PITR in Supabase and maintain an encrypted off-site backup. Never commit database credentials to Git.

## H. Production checklist
- [ ] Custom domain + HTTPS
- [ ] Supabase Auth configured
- [ ] First Super Admin created
- [ ] RLS tested with multiple roles
- [ ] MFA enabled for privileged users
- [ ] Backup/restore test completed
- [ ] Audit logs verified
- [ ] Password reset/email settings configured
- [ ] No service-role key in frontend
- [ ] No real data in demo/local files
- [ ] Privacy/data-retention policy approved by church leadership
