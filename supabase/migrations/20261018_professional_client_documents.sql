-- DocuMio Professional · client permissions and encrypted-at-rest private document storage
-- Additive migration; existing personal archives and companies remain untouched.
begin;

create table public.professional_client_permissions (
  studio_id uuid not null,
  client_id uuid not null,
  user_id uuid not null,
  can_edit boolean not null default false,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key(client_id,user_id),
  foreign key(client_id,studio_id) references public.professional_clients(id,studio_id) on delete cascade,
  foreign key(studio_id,user_id) references public.professional_studio_members(studio_id,user_id) on delete cascade
);
create index professional_permissions_member_idx
 on public.professional_client_permissions(studio_id,user_id);

-- SECURITY DEFINER is in the NON-exposed schema and checks auth.uid().
-- It prevents recursive RLS when professional_clients refers to ACLs.
create function documio_internal.professional_client_access(
 p_client_id uuid,p_write boolean default false
) returns boolean language plpgsql stable security definer set search_path=''
as $$
declare v_studio uuid; v_role text;
begin
  if auth.uid() is null then return false; end if;
  select studio_id into v_studio from public.professional_clients where id=p_client_id;
  if v_studio is null then return false; end if;
  select documio_internal.professional_role(v_studio) into v_role;
  if v_role='owner' then return true; end if;
  if v_role is null then return false; end if;
  return exists(
   select 1 from public.professional_client_permissions p
   where p.client_id=p_client_id and p.studio_id=v_studio
     and p.user_id=auth.uid()
     and (not p_write or (p.can_edit and v_role in ('professional','collaborator')))
  );
end;
$$;
revoke all on function documio_internal.professional_client_access(uuid,boolean)
 from public,anon;
grant execute on function documio_internal.professional_client_access(uuid,boolean)
 to authenticated;

create function public.documio_can_edit_client(p_client_id uuid)
returns boolean language sql stable security invoker set search_path=''
as $$ select documio_internal.professional_client_access(p_client_id,true); $$;
revoke all on function public.documio_can_edit_client(uuid) from public,anon;
grant execute on function public.documio_can_edit_client(uuid) to authenticated;

-- Automatically assign the creator of a customer to that customer;
-- owner retains implicit access. New team members get NO default access.
create function documio_internal.professional_assign_creator()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if exists(select 1 from public.professional_studio_members m
           where m.studio_id=new.studio_id and m.user_id=new.created_by
             and m.role in ('professional','collaborator')) then
   insert into public.professional_client_permissions(
       studio_id,client_id,user_id,can_edit,assigned_by)
   values(new.studio_id,new.id,new.created_by,true,new.created_by)
   on conflict(client_id,user_id) do nothing;
 end if;
 return new;
end;
$$;
revoke all on function documio_internal.professional_assign_creator() from public,anon;
create trigger professional_client_creator_acl after insert on public.professional_clients
 for each row execute function documio_internal.professional_assign_creator();

alter table public.professional_client_permissions enable row level security;
create policy professional_perms_read on public.professional_client_permissions
 for select to authenticated
 using(user_id=(select auth.uid())
  or documio_internal.professional_role(studio_id)='owner');
create policy professional_perms_insert on public.professional_client_permissions
 for insert to authenticated
 with check(documio_internal.professional_role(studio_id)='owner');
create policy professional_perms_update on public.professional_client_permissions
 for update to authenticated
 using(documio_internal.professional_role(studio_id)='owner')
 with check(documio_internal.professional_role(studio_id)='owner');
create policy professional_perms_delete on public.professional_client_permissions
 for delete to authenticated
 using(documio_internal.professional_role(studio_id)='owner');
revoke all on public.professional_client_permissions from anon,authenticated;
grant select,insert,delete on public.professional_client_permissions to authenticated;
grant update(can_edit) on public.professional_client_permissions to authenticated;
grant all on public.professional_client_permissions to service_role;

-- Narrow previous studio-wide reads and writes to the assigned CLIENT.
drop policy professional_clients_read on public.professional_clients;
drop policy professional_clients_edit on public.professional_clients;
create policy professional_clients_read on public.professional_clients
 for select to authenticated
 using(documio_internal.professional_client_access(id,false));
create policy professional_clients_edit on public.professional_clients
 for update to authenticated
 using(documio_internal.professional_client_access(id,true))
 with check(documio_internal.professional_client_access(id,true));

drop policy professional_cases_read on public.professional_cases;
drop policy professional_cases_add on public.professional_cases;
drop policy professional_cases_edit on public.professional_cases;
create policy professional_cases_read on public.professional_cases
 for select to authenticated
 using(documio_internal.professional_client_access(client_id,false));
create policy professional_cases_add on public.professional_cases
 for insert to authenticated
 with check(created_by=(select auth.uid())
   and documio_internal.professional_client_access(client_id,true));
create policy professional_cases_edit on public.professional_cases
 for update to authenticated
 using(documio_internal.professional_client_access(client_id,true))
 with check(documio_internal.professional_client_access(client_id,true));

-- Case change to another client is forbidden even if the user is authorized
-- to both clients: it would silently reclassify documents and audit history.
create function documio_internal.professional_case_immutable_client()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if new.client_id is distinct from old.client_id then
   raise exception 'Impossibile spostare una pratica tra clienti';
 end if;
 return new;
end;
$$;
revoke all on function documio_internal.professional_case_immutable_client() from public,anon;
create trigger professional_case_client_immutable
 before update of client_id on public.professional_cases
 for each row execute function documio_internal.professional_case_immutable_client();

drop policy professional_tasks_read on public.professional_case_tasks;
drop policy professional_tasks_add on public.professional_case_tasks;
drop policy professional_tasks_edit on public.professional_case_tasks;
create policy professional_tasks_read on public.professional_case_tasks
 for select to authenticated
 using(exists(select 1 from public.professional_cases c
   where c.id=case_id and c.studio_id=professional_case_tasks.studio_id));
create policy professional_tasks_add on public.professional_case_tasks
 for insert to authenticated
 with check(created_by=(select auth.uid()) and exists(
   select 1 from public.professional_cases c
   where c.id=case_id and c.studio_id=professional_case_tasks.studio_id
    and documio_internal.professional_client_access(c.client_id,true)));
create policy professional_tasks_edit on public.professional_case_tasks
 for update to authenticated
 using(exists(select 1 from public.professional_cases c
   where c.id=case_id and c.studio_id=professional_case_tasks.studio_id
     and documio_internal.professional_client_access(c.client_id,true)))
 with check(exists(select 1 from public.professional_cases c
   where c.id=case_id and c.studio_id=professional_case_tasks.studio_id
     and documio_internal.professional_client_access(c.client_id,true)));

-- Members may inspect their own membership; owner can manage roster.
drop policy professional_members_read on public.professional_studio_members;
create policy professional_members_read on public.professional_studio_members
 for select to authenticated
 using(user_id=(select auth.uid())
  or documio_internal.professional_role(studio_id)='owner');

-- Audit includes record identifiers: restrict all audit access to owner
-- until event ACL-aware per-entity querying is implemented.
drop policy professional_activity_read on public.professional_activity;
create policy professional_activity_read on public.professional_activity
 for select to authenticated
 using(documio_internal.professional_role(studio_id)='owner');

alter table public.professional_cases
 add constraint professional_cases_doc_scope_uniq unique(id,studio_id,client_id);

create table public.professional_documents (
 id uuid primary key default gen_random_uuid(),
 studio_id uuid not null,
 client_id uuid not null,
 original_name text not null check(length(trim(original_name)) between 1 and 200),
 content_type text not null check(content_type in
  ('application/pdf','image/jpeg','image/png','application/xml')),
 file_size bigint not null check(file_size between 1 and 20971520),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 bucket_id text not null default 'professional-documents'
   check(bucket_id='professional-documents'),
 storage_path text not null unique,
 uploaded_by uuid references auth.users(id) on delete set null,
 uploaded_at timestamptz not null default now(),
 unique(id,studio_id,client_id),
 foreign key(client_id,studio_id) references public.professional_clients(id,studio_id)
   on delete restrict,
 check(storage_path like studio_id::text || '/' || client_id::text || '/%')
);
create index professional_documents_client_idx
 on public.professional_documents(studio_id,client_id,uploaded_at desc);
create index professional_documents_sha_idx
 on public.professional_documents(studio_id,client_id,sha256);

create table public.professional_document_case_links (
 studio_id uuid not null,
 client_id uuid not null,
 document_id uuid not null,
 case_id uuid not null,
 linked_by uuid references auth.users(id) on delete set null,
 linked_at timestamptz not null default now(),
 primary key(document_id,case_id),
 foreign key(document_id,studio_id,client_id)
  references public.professional_documents(id,studio_id,client_id) on delete cascade,
 foreign key(case_id,studio_id,client_id)
  references public.professional_cases(id,studio_id,client_id) on delete cascade
);
create index professional_links_case_idx
 on public.professional_document_case_links(studio_id,case_id);

create table public.professional_document_reads (
 id bigint generated always as identity primary key,
 studio_id uuid not null,
 client_id uuid not null,
 document_id uuid not null,
 actor_id uuid references auth.users(id) on delete set null,
 read_at timestamptz not null default now(),
 foreign key(document_id,studio_id,client_id)
  references public.professional_documents(id,studio_id,client_id)
);
create index professional_document_reads_idx
 on public.professional_document_reads(studio_id,client_id,read_at desc);

alter table public.professional_documents enable row level security;
alter table public.professional_document_case_links enable row level security;
alter table public.professional_document_reads enable row level security;

create policy professional_documents_read on public.professional_documents
 for select to authenticated
 using(documio_internal.professional_client_access(client_id,false));
create policy professional_documents_insert on public.professional_documents
 for insert to authenticated
 with check(documio_internal.professional_client_access(client_id,true)
   and uploaded_by=(select auth.uid()));
create policy professional_links_read on public.professional_document_case_links
 for select to authenticated
 using(documio_internal.professional_client_access(client_id,false));
create policy professional_links_insert on public.professional_document_case_links
 for insert to authenticated
 with check(documio_internal.professional_client_access(client_id,true)
  and linked_by=(select auth.uid()));
create policy professional_reads_owner on public.professional_document_reads
 for select to authenticated using(documio_internal.professional_role(studio_id)='owner');

revoke all on public.professional_documents,public.professional_document_case_links,
  public.professional_document_reads from anon,authenticated;
grant select,insert on public.professional_documents to authenticated;
grant select,insert on public.professional_document_case_links to authenticated;
grant select on public.professional_document_reads to authenticated;
grant all on public.professional_documents,public.professional_document_case_links,
  public.professional_document_reads to service_role;

-- Separate PRIVATE bucket: authenticated users have no storage.objects
-- policies for this bucket. Only the server service-role uploads/downloads
-- AFTER authenticating and authorizing requests against metadata RLS.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('professional-documents','professional-documents',false,20971520,
  array['application/pdf','image/jpeg','image/png','application/xml']::text[])
 on conflict(id) do nothing;

commit;
