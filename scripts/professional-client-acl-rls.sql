\set ON_ERROR_STOP on
-- Verify ALL RLS scopes with synthetic identities on a disposable postgres.
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
insert into public.professional_studios(id,owner_user_id,name,studio_type)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '11111111-1111-4111-8111-111111111111','Contabilità Uno','commercialista');
insert into public.professional_clients(id,studio_id,display_name,client_type,created_by)
values
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Cliente A','azienda','11111111-1111-4111-8111-111111111111'),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Cliente B','azienda','11111111-1111-4111-8111-111111111111');
insert into public.professional_cases(id,studio_id,client_id,case_type,title,created_by)
values
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','iva','IVA cliente A',
  '11111111-1111-4111-8111-111111111111'),
 ('99999999-9999-4999-8999-999999999999',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'ffffffff-ffff-4fff-8fff-ffffffffffff','contabilita','Conti cliente B',
  '11111111-1111-4111-8111-111111111111');
insert into public.professional_case_tasks(studio_id,case_id,title,created_by)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Controlla fatture',
 '11111111-1111-4111-8111-111111111111');

insert into public.professional_studio_invites(studio_id,email,role,token_hash,created_by,expires_at)
values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','pro@example.test','professional',
  repeat('c',64),'11111111-1111-4111-8111-111111111111',now()+interval '1 day'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','viewer@example.test','viewer',
  repeat('a',64),'11111111-1111-4111-8111-111111111111',now()+interval '1 day'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','collab@example.test','collaborator',
  repeat('b',64),'11111111-1111-4111-8111-111111111111',now()+interval '1 day');

insert into public.professional_documents
  (id,studio_id,client_id,original_name,content_type,file_size,sha256,storage_path,uploaded_by)
values
 ('77777777-7777-4777-8777-777777777777',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','fattura.pdf',
  'application/pdf',100,repeat('1',64),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc/originale.pdf',
  '11111111-1111-4111-8111-111111111111'),
 ('88888888-8888-4888-8888-888888888888',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'ffffffff-ffff-4fff-8fff-ffffffffffff','riservato.pdf',
  'application/pdf',120,repeat('2',64),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/ffffffff-ffff-4fff-8fff-ffffffffffff/altro.pdf',
  '11111111-1111-4111-8111-111111111111');
insert into public.professional_document_case_links(studio_id,client_id,case_id,document_id,linked_by)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 '77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111');

do $$
declare failed boolean := false;
begin
 begin
  insert into public.professional_documents
    (studio_id,client_id,original_name,content_type,file_size,sha256,storage_path,uploaded_by)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','duplicato.pdf',
    'application/pdf',100,repeat('1',64),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc/duplicato.pdf',
    '11111111-1111-4111-8111-111111111111');
 exception when unique_violation then failed:=true; end;
 if not failed then raise exception 'Duplicato SHA registrato due volte'; end if;
 failed:=false;
 begin
  insert into public.professional_document_case_links(studio_id,client_id,case_id,document_id,linked_by)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    '99999999-9999-4999-8999-999999999999',
    '77777777-7777-4777-8777-777777777777',
    '11111111-1111-4111-8111-111111111111');
 exception when foreign_key_violation then failed:=true; end;
 if not failed then raise exception 'Documento attraversa due clienti'; end if;
end $$;

set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
insert into public.professional_studios(id,owner_user_id,name,studio_type)
 values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   '22222222-2222-4222-8222-222222222222','Studio Esterno','legale');
do $$
begin
 if (select count(*) from public.professional_clients)<>0 then
   raise exception 'Cross-studio client leakage'; end if;
 if (select count(*) from public.professional_documents)<>0 then
   raise exception 'Cross-studio document leakage'; end if;
end $$;

set request.jwt.claim.sub='66666666-6666-4666-8666-666666666666';
select public.documio_accept_professional_invite(repeat('c',64));
set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
select public.documio_accept_professional_invite(repeat('a',64));
set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
select public.documio_accept_professional_invite(repeat('b',64));

set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
insert into public.professional_client_permissions(studio_id,client_id,user_id,can_edit,assigned_by)
values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 '66666666-6666-4666-8666-666666666666',true,
 '11111111-1111-4111-8111-111111111111'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'ffffffff-ffff-4fff-8fff-ffffffffffff',
 '33333333-3333-4333-8333-333333333333',false,
 '11111111-1111-4111-8111-111111111111');

set request.jwt.claim.sub='66666666-6666-4666-8666-666666666666';
do $$
begin
 if (select count(*) from public.professional_clients)<>1 then
   raise exception 'Professionista può vedere clienti non assegnati'; end if;
 if (select count(*) from public.professional_cases)<>1 then
   raise exception 'Professionista può vedere fascicoli non assegnati'; end if;
 if (select count(*) from public.professional_documents)<>1 then
   raise exception 'Professionista può vedere documenti non assegnati'; end if;
 if (select count(*) from public.professional_document_case_links)<>1 then
   raise exception 'Professionista vede associazioni di clienti non assegnati'; end if;
 if not public.documio_can_edit_client('cccccccc-cccc-4ccc-8ccc-cccccccccccc') then
   raise exception 'Professionista non può modificare cliente assegnato'; end if;
 if public.documio_can_edit_client('ffffffff-ffff-4fff-8fff-ffffffffffff') then
   raise exception 'Professionista può modificare cliente NON assegnato'; end if;
end $$;
set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
do $$
declare failed boolean:=false;
begin
 if (select count(*) from public.professional_clients)<>1 then
   raise exception 'Viewer legge clienti non assegnati';end if;
 if (select count(*) from public.professional_cases)<>1 then
   raise exception 'Viewer legge cause non assegnate';end if;
 if (select count(*) from public.professional_documents)<>1 then
   raise exception 'Viewer legge file non assegnati';end if;
 if public.documio_can_edit_client('ffffffff-ffff-4fff-8fff-ffffffffffff') then
   raise exception 'Viewer può modificare cliente';end if;
 begin
  insert into public.professional_documents
    (studio_id,client_id,original_name,content_type,file_size,sha256,storage_path,uploaded_by)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'ffffffff-ffff-4fff-8fff-ffffffffffff','illegal.pdf','application/pdf',
    100,repeat('3',64),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/ffffffff-ffff-4fff-8fff-ffffffffffff/illegal.pdf',
    '33333333-3333-4333-8333-333333333333');
 exception when insufficient_privilege then failed:=true;end;
 if not failed then raise exception 'Viewer può caricare file';end if;
end $$;

-- Remove client's assigned access and ensure prior reads cease immediately.
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
delete from public.professional_client_permissions
 where user_id='66666666-6666-4666-8666-666666666666';
set request.jwt.claim.sub='66666666-6666-4666-8666-666666666666';
do $$
begin
 if (select count(*) from public.professional_clients)<>0
    or (select count(*) from public.professional_documents)<>0
 then raise exception 'Permission revoked but data still readable'; end if;
end $$;
reset role;
