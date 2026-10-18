-- Le prove falliscono immediatamente se esiste accesso inter-studio.
\set ON_ERROR_STOP on

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
insert into public.professional_studios(id,owner_user_id,name,studio_type)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111','Studio Uno','commercialista');
insert into public.professional_clients(id,studio_id,client_type,display_name,created_by)
values('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','azienda','Cliente Uno',
  '11111111-1111-4111-8111-111111111111');
insert into public.professional_cases(id,studio_id,client_id,case_type,title,created_by)
values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','iva','Revisione IVA',
  '11111111-1111-4111-8111-111111111111');
insert into public.professional_case_tasks(
  studio_id,case_id,title,created_by,sort_order)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Controllare registri IVA',
  '11111111-1111-4111-8111-111111111111',1);

-- Inviti monouso e validi solo con l'email verificata.
insert into public.professional_studio_invites(studio_id,email,role,token_hash,
 created_by,expires_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','viewer@example.test','viewer',
  repeat('a',64),'11111111-1111-4111-8111-111111111111',now()+interval '7 days'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','collab@example.test','collaborator',
  repeat('b',64),'11111111-1111-4111-8111-111111111111',now()+interval '7 days'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','pro@example.test','professional',
  repeat('c',64),'11111111-1111-4111-8111-111111111111',now()+interval '7 days'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','wrong@example.test','viewer',
  repeat('d',64),'11111111-1111-4111-8111-111111111111',now()+interval '7 days');

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
insert into public.professional_studios(id,owner_user_id,name,studio_type)
values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '22222222-2222-4222-8222-222222222222','Studio Due','legale');
insert into public.professional_clients(id,studio_id,client_type,display_name,created_by)
values('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','persona','Cliente Due',
  '22222222-2222-4222-8222-222222222222');

do $$
begin
  if (select count(*) from public.professional_studios)<>1 then
    raise exception 'Titolare Due può leggere altri studi';
  end if;
  if (select count(*) from public.professional_clients)<>1 then
    raise exception 'Titolare Due può leggere altri clienti';
  end if;
  if (select count(*) from public.professional_cases)<>0 then
    raise exception 'Titolare Due può leggere altri fascicoli';
  end if;
  begin
    insert into public.professional_cases(
     studio_id,client_id,case_type,title,created_by)
    values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'contratto','Tentativo traversale',
      '22222222-2222-4222-8222-222222222222');
    raise exception 'Chiave incrociata studio-cliente ignorata';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Un utente qualsiasi non può usare l'invito destinato ad un'altra email.
set request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
do $$
declare blocked boolean := false;
begin
  begin
    perform public.documio_accept_professional_invite(repeat('a',64));
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Invito accettato da email diversa'; end if;
end $$;

set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select public.documio_accept_professional_invite(repeat('a',64));
do $$
declare blocked boolean := false;
begin
  if (select count(*) from public.professional_studios)<>1 then
    raise exception 'Viewer non vede il proprio studio oppure vede studi altrui';
  end if;
  if (select count(*) from public.professional_cases)<>1 then
    raise exception 'Viewer vede fascicoli non consentiti';
  end if;
  begin
    insert into public.professional_clients(
      studio_id,client_type,display_name,created_by)
    values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'persona','Inserimento vietato',
      '33333333-3333-4333-8333-333333333333');
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Viewer può inserire un cliente'; end if;
end $$;

-- Collaboratore modifica i dati ma non può certificare il completamento.
set request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
select public.documio_accept_professional_invite(repeat('b',64));
update public.professional_cases set description='Note operative'
 where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
do $$
declare blocked boolean := false;
begin
  begin
    update public.professional_cases set status='completata'
    where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Collaboratore ha approvato la pratica'; end if;
end $$;

-- Il professionista conferma e l'operazione è attribuita all'utente corretto.
set request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
select public.documio_accept_professional_invite(repeat('c',64));
update public.professional_cases set status='completata'
 where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
do $$
begin
 if not exists(select 1 from public.professional_cases
  where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    and reviewed_by='66666666-6666-4666-8666-666666666666'
    and reviewed_at is not null)
 then raise exception 'Approvazione umana non tracciata'; end if;
end $$;

-- Il titolare può revocare un utente e un invito non accettato.
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.documio_remove_professional_member(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '33333333-3333-4333-8333-333333333333');
do $$
begin
  if exists(select 1 from public.professional_studio_members
      where user_id='33333333-3333-4333-8333-333333333333')
  then raise exception 'Rimozione collaboratore non eseguita'; end if;
  if (select count(*) from public.professional_activity
      where studio_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') < 6
  then raise exception 'Audit attività professionale incompleto'; end if;
end $$;
select public.documio_revoke_professional_invite(id)
from public.professional_studio_invites where token_hash=repeat('d',64);

set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$
begin
 if (select count(*) from public.professional_studios)<>0 then
   raise exception 'Accesso persistente dopo revoca';
 end if;
end $$;
reset role;
