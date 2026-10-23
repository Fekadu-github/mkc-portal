-- MKC Amanuel Local Church — v14 migration: sermon media uploads
-- Run this AFTER schema_v13_content.sql in the Supabase SQL Editor. Safe to re-run.
-- Adds a dedicated storage bucket for short sermon video/audio clips uploaded
-- directly from a Super Admin's device (separate from the "site-content"
-- bucket used for Daily Update photos, since video files are larger).

-- Adjust file_size_limit below if you need to allow longer/larger recordings.
-- 100MB matches the client-side check in portal.js for a short (~2 minute) clip.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sermon-media', 'sermon-media', true, 104857600,
  array['video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/wav','audio/ogg']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sermon_media_public_read" on storage.objects;
create policy "sermon_media_public_read" on storage.objects
  for select using (bucket_id = 'sermon-media');

drop policy if exists "sermon_media_super_admin_write" on storage.objects;
create policy "sermon_media_super_admin_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sermon-media' and public.current_role() = 'super_admin');

drop policy if exists "sermon_media_super_admin_update" on storage.objects;
create policy "sermon_media_super_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'sermon-media' and public.current_role() = 'super_admin');

drop policy if exists "sermon_media_super_admin_delete" on storage.objects;
create policy "sermon_media_super_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'sermon-media' and public.current_role() = 'super_admin');
