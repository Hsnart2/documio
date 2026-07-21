-- DocuMio phase 2: document lifecycle security
-- Safe to run more than once.

begin;

alter table if exists public.documents enable row level security;
alter table if exists public.document_attachments enable row level security;
alter table if exists public.practices enable row level security;
alter table if exists public.notification_preferences enable row level security;

alter table if exists public.documents force row level security;
alter table if exists public.document_attachments force row level security;
alter table if exists public.practices force row level security;
alter table if exists public.notification_preferences force row level security;

-- User-owned database rows.
drop policy if exists "documents_owner_select" on public.documents;
drop policy if exists "documents_owner_insert" on public.documents;
drop policy if exists "documents_owner_update" on public.documents;
drop policy if exists "documents_owner_delete" on public.documents;
create policy "documents_owner_select" on public.documents for select to authenticated using (auth.uid() = user_id);
create policy "documents_owner_insert" on public.documents for insert to authenticated with check (auth.uid() = user_id);
create policy "documents_owner_update" on public.documents for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "documents_owner_delete" on public.documents for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "attachments_owner_select" on public.document_attachments;
drop policy if exists "attachments_owner_insert" on public.document_attachments;
drop policy if exists "attachments_owner_update" on public.document_attachments;
drop policy if exists "attachments_owner_delete" on public.document_attachments;
create policy "attachments_owner_select" on public.document_attachments for select to authenticated using (auth.uid() = user_id);
create policy "attachments_owner_insert" on public.document_attachments for insert to authenticated with check (auth.uid() = user_id);
create policy "attachments_owner_update" on public.document_attachments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "attachments_owner_delete" on public.document_attachments for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "practices_owner_select" on public.practices;
drop policy if exists "practices_owner_insert" on public.practices;
drop policy if exists "practices_owner_update" on public.practices;
drop policy if exists "practices_owner_delete" on public.practices;
create policy "practices_owner_select" on public.practices for select to authenticated using (auth.uid() = user_id);
create policy "practices_owner_insert" on public.practices for insert to authenticated with check (auth.uid() = user_id);
create policy "practices_owner_update" on public.practices for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "practices_owner_delete" on public.practices for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "preferences_owner_select" on public.notification_preferences;
drop policy if exists "preferences_owner_insert" on public.notification_preferences;
drop policy if exists "preferences_owner_update" on public.notification_preferences;
drop policy if exists "preferences_owner_delete" on public.notification_preferences;
create policy "preferences_owner_select" on public.notification_preferences for select to authenticated using (auth.uid() = user_id);
create policy "preferences_owner_insert" on public.notification_preferences for insert to authenticated with check (auth.uid() = user_id);
create policy "preferences_owner_update" on public.notification_preferences for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "preferences_owner_delete" on public.notification_preferences for delete to authenticated using (auth.uid() = user_id);

-- The document bucket must never expose permanent public URLs.
update storage.buckets set public = false where id = 'documents';

-- Storage paths must begin with the authenticated user's UUID.
drop policy if exists "documents_storage_owner_select" on storage.objects;
drop policy if exists "documents_storage_owner_insert" on storage.objects;
drop policy if exists "documents_storage_owner_update" on storage.objects;
drop policy if exists "documents_storage_owner_delete" on storage.objects;

create policy "documents_storage_owner_select" on storage.objects
for select to authenticated
using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents_storage_owner_insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents_storage_owner_update" on storage.objects
for update to authenticated
using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents_storage_owner_delete" on storage.objects
for delete to authenticated
using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
