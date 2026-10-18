-- Disposable PostgreSQL 17 test — NO production data.
\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
insert into public.professional_studios(id,owner_user_id,name,studio_type)
 values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '11111111-1111-4111-8111-111111111111','Studio Verifica','multiservizi');
insert into public.professional_clients(id,studio_id,display_name,client_type,created_by)
 values
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'Azienda Uno','azienda','11111111-1111-4111-8111-111111111111'),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'Azienda Due','azienda','11111111-1111-4111-8111-111111111111'),
 ('12121212-1212-4121-8121-121212121212','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'Privato CAF','persona','11111111-1111-4111-8111-111111111111');

insert into public.professional_cases(id,studio_id,client_id,case_type,title,created_by)
 values
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','contabilita','Prima nota ottobre',
 '11111111-1111-4111-8111-111111111111'),
 ('abababab-abab-4aba-8aba-abababababab','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '12121212-1212-4121-8121-121212121212','730','Dichiarazione 730',
 '11111111-1111-4111-8111-111111111111'),
 ('edededed-eded-4ede-8ede-edededededed','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '12121212-1212-4121-8121-121212121212','contenzioso','Recupero credito',
 '11111111-1111-4111-8111-111111111111');

do $$
begin
 if (select count(*) from public.professional_ledger_accounts
  where client_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<14
 then raise exception 'Conti aziendali non inizializzati';end if;
 if (select count(*) from public.professional_ledger_accounts
  where client_id='12121212-1212-4121-8121-121212121212')<>0
 then raise exception 'Contabilità forzata su contribuente privato';end if;
end $$;

select public.documio_create_journal(
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-10-18',
 'Ricavo di prova senza dati reali',
 (select id from public.professional_ledger_accounts where
  client_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and code='1010'),
 (select id from public.professional_ledger_accounts where
  client_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and code='4000'),
 123.45);
do $$
declare j uuid; blocked boolean;
begin
 select id into j from public.professional_journal_entries limit 1;
 if j is null then raise exception 'Prima nota non creata';end if;
 if (select count(*) from public.professional_journal_lines where entry_id=j)<>2 then
  raise exception 'Dare/Avere non creati';end if;
 update public.professional_journal_entries set status='posted' where id=j;
 if not exists(select 1 from public.professional_journal_entries
  where id=j and status='posted' and posted_by=auth.uid() and posted_at is not null)
 then raise exception 'Scrittura non contabilizzata';end if;
 blocked:=false;
 begin
  update public.professional_journal_lines set debit=1 where entry_id=j;
 exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Riga contabilizzata modificabile';end if;
 blocked:=false;
 begin
  update public.professional_journal_entries set description='Cambio illecito'
   where id=j;
 exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Scrittura contabilizzata modificabile';end if;
end $$;
do $$
declare d numeric; c numeric;
begin
 select coalesce(sum(debit),0),coalesce(sum(credit),0) into d,c
 from public.professional_ledger_totals where client_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 if d<>123.45 or c<>123.45 then raise exception 'Mancata quadratura';end if;
end $$;

insert into public.professional_journal_entries(studio_id,client_id,entry_date,description,created_by)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-10-18','Bozza sbilanciata',
 '11111111-1111-4111-8111-111111111111');
do $$
declare j uuid;blocked boolean:=false;
begin
 select id into j from public.professional_journal_entries
  where description='Bozza sbilanciata';
 insert into public.professional_journal_lines(studio_id,client_id,entry_id,account_id,debit)
 values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  j,(select id from public.professional_ledger_accounts
  where client_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and code='1010'),30);
 begin
  update public.professional_journal_entries set status='posted' where id=j;
 exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Bozza non quadrata contabilizzata';end if;
end $$;

insert into public.professional_vat_items(
 studio_id,client_id,period,direction,description,taxable,vat,created_by)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-10','sale',
 'Vendita di prova',100,22,'11111111-1111-4111-8111-111111111111');
update public.professional_vat_items set status='confirmed'
where client_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
do $$
declare blocked boolean:=false;
begin
 begin
  update public.professional_vat_items set status='needs_review' where status='confirmed';
 exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Voce IVA validata modificabile';end if;
end $$;

-- CAF requirement: physical evidence must be linked to SAME case.
insert into public.professional_case_requirements(
 studio_id,client_id,case_id,requirement_code,label)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '12121212-1212-4121-8121-121212121212',
 'abababab-abab-4aba-8aba-abababababab','cu','Certificazione unica di prova');
do $$
declare blocked boolean:=false;
begin
 begin
  update public.professional_case_requirements set status='provided';
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Requisito segnato come ricevuto senza prova';end if;
end $$;
insert into public.professional_documents(id,studio_id,client_id,original_name,
 content_type,file_size,sha256,storage_path,uploaded_by)
values('77777777-7777-4777-8777-777777777777',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '12121212-1212-4121-8121-121212121212','cu.pdf',
 'application/pdf',100,repeat('7',64),
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/12121212-1212-4121-8121-121212121212/cu.pdf',
 '11111111-1111-4111-8111-111111111111');
insert into public.professional_document_case_links(
 studio_id,client_id,case_id,document_id,linked_by)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '12121212-1212-4121-8121-121212121212',
 'abababab-abab-4aba-8aba-abababababab',
 '77777777-7777-4777-8777-777777777777',
 '11111111-1111-4111-8111-111111111111');
update public.professional_case_requirements set
 document_id='77777777-7777-4777-8777-777777777777',status='verified'
where case_id='abababab-abab-4aba-8aba-abababababab';
insert into public.professional_legal_events(
 studio_id,client_id,case_id,event_date,event_type,title,created_by)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '12121212-1212-4121-8121-121212121212',
 'edededed-eded-4ede-8ede-edededededed',
 '2026-11-01','udienza','Data da controllare',
 '11111111-1111-4111-8111-111111111111');
do $$
declare blocked boolean:=false;
begin
 begin
  insert into public.professional_legal_events(
   studio_id,client_id,case_id,event_date,event_type,title,created_by)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
   '2026-11-01','udienza','Errore contabile',
   '11111111-1111-4111-8111-111111111111');
 exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Udienza registrata su pratica di contabilità';end if;
end $$;

-- Joined collaborator WITHOUT a client assignment: should not read.
insert into public.professional_studio_invites(studio_id,email,role,token_hash,created_by,expires_at)
 values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','collab@example.test','collaborator',
 repeat('b',64),'11111111-1111-4111-8111-111111111111',now()+interval '1 day');
set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
select public.documio_accept_professional_invite(repeat('b',64));
do $$
begin
 if (select count(*) from public.professional_journal_entries)<>0
    or (select count(*) from public.professional_vat_items)<>0
    or (select count(*) from public.professional_case_requirements)<>0
 then raise exception 'Collaboratore vede dati non assegnati';end if;
end $$;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
insert into public.professional_client_permissions(studio_id,client_id,user_id,can_edit,assigned_by)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 '55555555-5555-4555-8555-555555555555',true,
 '11111111-1111-4111-8111-111111111111');
set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
do $$
declare blocked boolean:=false;
begin
 if (select count(*) from public.professional_journal_entries)<>2 then
  raise exception 'Collaboratore non legge registri assegnati';end if;
 begin
  update public.professional_vat_items set status='confirmed' where status='needs_review';
 exception when raise_exception then blocked:=true;end;
 if not blocked and exists(select 1 from public.professional_vat_items
   where status='confirmed' and confirmed_by=auth.uid()) then
    raise exception 'Collaboratore ha confermato IVA';end if;
end $$;
reset role;
