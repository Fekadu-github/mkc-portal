# Supabase / PostgreSQL — v12

Use `../SUPABASE_V12_SETUP.md` for the complete deployment procedure.

The canonical SQL is `schema.sql` (same content as `schema_v12.sql`). It creates:
- Supabase Auth profile linkage
- Church departments and roles
- People and families
- Attendance and events
- Follow-up cases
- RLS policies
- TOTP MFA-compatible authentication flow on the client
- Database audit triggers
- Age/age-group directory view

**Never put a Supabase service-role key or database password in the frontend.**

## Applying to an existing project
`schema.sql` already includes every fix through v20 (including the fix in
`schema_v20_fix_people_read_recursion.sql`), so a **brand-new** Supabase project
only needs `schema.sql` plus the feature patches `schema_v13_content.sql` through
`schema_v19_public_content_privileges.sql`, run in order.

If you already deployed an earlier version of `schema.sql` (before this fix),
just run `schema_v20_fix_people_read_recursion.sql` on top of what you have —
it's safe to run more than once.

### v20 — fixes department users being unable to save people records
`people_read` and `people_update` previously called a function that queried
`public.people` from inside a policy protecting `public.people`. Any statement
needing to read back the affected row under that policy (like the portal's
"Add Person" insert-then-select) triggered infinite self-reference, which
Postgres resolves by denying the check. Only `department_user` accounts hit
this — Super Admin/Secretary/Pastor bypass it via `is_admin()`. v20 rewrites
those two policies to check `department_id` and `person_departments` directly
instead. It also formally tracks `trg_set_people_department`, a trigger that
was already running on production but was missing from every file in this
repo — it forces new people records to use the submitting department user's
own department, regardless of what the client sends.
