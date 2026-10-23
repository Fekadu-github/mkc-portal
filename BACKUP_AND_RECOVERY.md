# MKC Amanuel — Backup & Recovery Policy (v12)

## 1. Supabase managed backups
Use the Supabase project dashboard to enable/configure the highest backup and point-in-time recovery option available on the church's plan. Review the project's backup/restore documentation and verify the retention period.

## 2. Off-site encrypted backup
Maintain an independent encrypted backup of the PostgreSQL database. A trusted administrator/server can use `pg_dump` with the database connection string supplied by Supabase. Never place database passwords, service-role keys, or connection strings in the website repository.

Example on a secured administrator workstation/server:

```bash
pg_dump "$DATABASE_URL" --format=custom --file="mkc_amanuel_$(date +%F).dump"
```

Store the resulting dump in an encrypted, access-controlled backup location. Test restoration at least quarterly.

## 3. Recovery test
1. Create a separate recovery/test Supabase project.
2. Restore the dump to the test environment.
3. Run `supabase/schema_v12.sql` only when the dump does not already contain the schema, or reconcile migrations carefully.
4. Verify users, profiles, RLS, departments, people, attendance, events and follow-up records.
5. Verify the portal can authenticate and that a department user cannot see another department's people.

## 4. Minimum backup controls
- Daily automated backup where supported.
- Encrypted storage.
- At least one off-site copy.
- Restricted access to two authorized administrators.
- Quarterly restore test.
- Record the last successful restore test in church IT operations documentation.
