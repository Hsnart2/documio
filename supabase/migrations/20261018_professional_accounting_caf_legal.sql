-- DocuMio Professional · prima nota con partita doppia, registri IVA provvisori,
-- checklist CAF e cronologia legale. Additiva, non sostituisce invii ufficiali.
begin;

-- CAF: tipi pratica aggiuntivi, non cambia pratiche esistenti.
alter table public.professional_cases
 drop constraint if exists professional_cases_case_type_check;
alter table public.professional_cases
 add constraint professional_cases_case_type_check check(case_type in
 ('contabilita','iva','redditi','f24','730','isee','successione',
  'contratto','contenzioso','consulenza','altro','bonus','red','pensioni'));

-- Piano conti per azienda cliente.
create table public.professional_ledger_accounts (
 id uuid primary key default gen_random_uuid(),
 studio_id uuid not null,
 client_id uuid not null,
 code text not null check(code ~ '^[0-9A-Za-z.-]{2,20}$'),
 name text not null check(length(trim(name)) between 2 and 160),
 account_type text not null check(account_type in
  ('asset','liability','equity','revenue','expense')),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(id,studio_id,client_id),
 unique(client_id,code),
 foreign key(client_id,studio_id) references public.professional_clients(id,studio_id)
   on delete restrict
);
create index professional_accounts_scope_idx on
 public.professional_ledger_accounts(studio_id,client_id,code);

create table public.professional_journal_entries (
 id uuid primary key default gen_random_uuid(),
 studio_id uuid not null,
 client_id uuid not null,
 entry_date date not null,
 description text not null check(length(trim(description)) between 3 and 400),
 currency text not null default 'EUR' check(currency='EUR'),
 status text not null default 'draft' check(status in ('draft','posted')),
 supporting_document_id uuid,
 created_by uuid references auth.users(id) on delete set null,
 posted_by uuid references auth.users(id) on delete set null,
 posted_at timestamptz,
 created_at timestamptz not null default now(),
 unique(id,studio_id,client_id),
 foreign key(client_id,studio_id) references public.professional_clients(id,studio_id),
 foreign key(supporting_document_id,studio_id,client_id)
  references public.professional_documents(id,studio_id,client_id),
 check((status='draft' and posted_at is null and posted_by is null)
   or (status='posted' and posted_at is not null))
);
create index professional_journal_scope_idx on
 public.professional_journal_entries(studio_id,client_id,entry_date desc);

create table public.professional_journal_lines (
 id uuid primary key default gen_random_uuid(),
 studio_id uuid not null,
 client_id uuid not null,
 entry_id uuid not null,
 account_id uuid not null,
 debit numeric(14,2) not null default 0 check(debit>=0),
 credit numeric(14,2) not null default 0 check(credit>=0),
 note text,
 check((debit>0 and credit=0) or (credit>0 and debit=0)),
 foreign key(entry_id,studio_id,client_id)
   references public.professional_journal_entries(id,studio_id,client_id) on delete cascade,
 foreign key(account_id,studio_id,client_id)
   references public.professional_ledger_accounts(id,studio_id,client_id)
);
create index professional_journal_lines_entry_idx on
 public.professional_journal_lines(entry_id,account_id);

create function documio_internal.professional_journal_guard()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare num_lines integer; total_d numeric(18,2); total_c numeric(18,2);
begin
 if old.status='posted' then
   raise exception 'Scrittura contabilizzata immutabile: registra uno storno';
 end if;
 if new.studio_id is distinct from old.studio_id
    or new.client_id is distinct from old.client_id
    or new.created_by is distinct from old.created_by then
   raise exception 'Impossibile alterare l origine della scrittura';
 end if;
 if new.status='posted' then
   if documio_internal.professional_role(new.studio_id) not in ('owner','professional')
     or not documio_internal.professional_client_access(new.client_id,true) then
     raise exception 'Contabilizzazione riservata al professionista';
   end if;
   select count(*),coalesce(sum(debit),0),coalesce(sum(credit),0)
    into num_lines,total_d,total_c from public.professional_journal_lines
    where entry_id=new.id and studio_id=new.studio_id and client_id=new.client_id;
   if num_lines<2 or total_d<=0 or total_d<>total_c then
     raise exception 'Scrittura non quadrata: totale Dare e Avere devono coincidere';
   end if;
   new.posted_by:=auth.uid();
   new.posted_at:=now();
 else
   new.posted_by:=null;new.posted_at:=null;
 end if;
 return new;
end;
$$;
revoke all on function documio_internal.professional_journal_guard() from public,anon;
create trigger professional_journal_guard before update on public.professional_journal_entries
 for each row execute function documio_internal.professional_journal_guard();

create function documio_internal.professional_line_guard()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare current_status text;
begin
 if tg_op='UPDATE' and
  (new.studio_id is distinct from old.studio_id
    or new.client_id is distinct from old.client_id
    or new.entry_id is distinct from old.entry_id) then
   raise exception 'Impossibile spostare una riga contabile tra scritture';
 end if;
 select status into current_status from public.professional_journal_entries
  where id=(case when tg_op='DELETE' then old.entry_id else new.entry_id end);
 if current_status is distinct from 'draft' then
   raise exception 'Righe contabili non modificabili dopo la contabilizzazione';
 end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function documio_internal.professional_line_guard() from public,anon;
create trigger professional_line_guard before insert or update or delete
 on public.professional_journal_lines
 for each row execute function documio_internal.professional_line_guard();

-- Proposta base, modificabile senza riclassificare registrazioni già contabilizzate.
create function documio_internal.professional_seed_accounts()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.client_type='azienda' then
   insert into public.professional_ledger_accounts(studio_id,client_id,code,name,account_type)
   select new.studio_id,new.id,t.code,t.name,t.kind
   from (values
    ('1000','Cassa','asset'),('1010','Banca','asset'),
    ('1200','Crediti verso clienti','asset'),('2000','Debiti fornitori','liability'),
    ('2100','IVA a debito (da verificare)','liability'),
    ('2110','IVA a credito (da verificare)','asset'),
    ('3000','Capitale netto','equity'),('4000','Ricavi vendite','revenue'),
    ('5000','Materie prime','expense'),('5100','Trasporti','expense'),
    ('5200','Utenze','expense'),('5300','Canoni leasing','expense'),
    ('5400','Affitti','expense'),('5900','Altri costi','expense')
   ) as t(code,name,kind)
   on conflict(client_id,code) do nothing;
 end if;
 return new;
end;
$$;
revoke all on function documio_internal.professional_seed_accounts() from public,anon;
create trigger professional_seed_accounts after insert on public.professional_clients
 for each row execute function documio_internal.professional_seed_accounts();
insert into public.professional_ledger_accounts(studio_id,client_id,code,name,account_type)
select c.studio_id,c.id,t.code,t.name,t.kind
from public.professional_clients c
cross join (values
 ('1000','Cassa','asset'),('1010','Banca','asset'),
 ('1200','Crediti verso clienti','asset'),('2000','Debiti fornitori','liability'),
 ('2100','IVA a debito (da verificare)','liability'),
 ('2110','IVA a credito (da verificare)','asset'),
 ('3000','Capitale netto','equity'),('4000','Ricavi vendite','revenue'),
 ('5000','Materie prime','expense'),('5100','Trasporti','expense'),
 ('5200','Utenze','expense'),('5300','Canoni leasing','expense'),
 ('5400','Affitti','expense'),('5900','Altri costi','expense')
) as t(code,name,kind)
where c.client_type='azienda'
on conflict(client_id,code) do nothing;

alter table public.professional_ledger_accounts enable row level security;
alter table public.professional_journal_entries enable row level security;
alter table public.professional_journal_lines enable row level security;
create policy professional_accounts_read on public.professional_ledger_accounts
 for select to authenticated
 using(documio_internal.professional_client_access(client_id,false));
create policy professional_accounts_write on public.professional_ledger_accounts
 for insert to authenticated
 with check(documio_internal.professional_client_access(client_id,true));
create policy professional_accounts_edit on public.professional_ledger_accounts
 for update to authenticated
 using(documio_internal.professional_client_access(client_id,true))
 with check(documio_internal.professional_client_access(client_id,true));
create policy professional_journal_read on public.professional_journal_entries
 for select to authenticated
 using(documio_internal.professional_client_access(client_id,false));
create policy professional_journal_add on public.professional_journal_entries
 for insert to authenticated
 with check(documio_internal.professional_client_access(client_id,true)
    and created_by=(select auth.uid()) and status='draft');
create policy professional_journal_edit on public.professional_journal_entries
 for update to authenticated
 using(documio_internal.professional_client_access(client_id,true))
 with check(documio_internal.professional_client_access(client_id,true));
create policy professional_lines_read on public.professional_journal_lines
 for select to authenticated
 using(documio_internal.professional_client_access(client_id,false));
create policy professional_lines_write on public.professional_journal_lines
 for insert to authenticated
 with check(documio_internal.professional_client_access(client_id,true));
create policy professional_lines_edit on public.professional_journal_lines
 for update to authenticated
 using(documio_internal.professional_client_access(client_id,true))
 with check(documio_internal.professional_client_access(client_id,true));
create policy professional_lines_delete on public.professional_journal_lines
 for delete to authenticated
 using(documio_internal.professional_client_access(client_id,true));

revoke all on public.professional_ledger_accounts,public.professional_journal_entries,
 public.professional_journal_lines from anon,authenticated;
grant select,insert on public.professional_ledger_accounts to authenticated;
grant update(name,active) on public.professional_ledger_accounts to authenticated;
grant select,insert on public.professional_journal_entries to authenticated;
grant update(status,description,entry_date) on public.professional_journal_entries to authenticated;
grant select,insert,delete on public.professional_journal_lines to authenticated;
grant update(account_id,debit,credit,note) on public.professional_journal_lines to authenticated;
grant all on public.professional_ledger_accounts,public.professional_journal_entries,
 public.professional_journal_lines to service_role;

-- Atomic journal creation. Runs with user's RLS; no privilege escalation.
create function public.documio_create_journal(
 p_client_id uuid,p_entry_date date,p_description text,
 p_debit_account uuid,p_credit_account uuid,p_amount numeric
) returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_studio uuid;v_id uuid;
begin
 if auth.uid() is null or p_debit_account=p_credit_account
   or p_amount is null or p_amount<=0 or p_amount>999999999999.99
   or p_entry_date is null or length(trim(coalesce(p_description,'')))<3 then
   raise exception 'Scrittura non valida';
 end if;
 select studio_id into v_studio from public.professional_clients
   where id=p_client_id;
 if not found or not documio_internal.professional_client_access(p_client_id,true) then
   raise exception 'Cliente non autorizzato' using errcode='42501';
 end if;
 insert into public.professional_journal_entries(
   studio_id,client_id,entry_date,description,created_by)
 values(v_studio,p_client_id,p_entry_date,left(p_description,400),auth.uid())
 returning id into v_id;
 insert into public.professional_journal_lines(studio_id,client_id,entry_id,account_id,debit,credit)
 values
  (v_studio,p_client_id,v_id,p_debit_account,p_amount,0),
  (v_studio,p_client_id,v_id,p_credit_account,0,p_amount);
 return v_id;
end;
$$;
revoke all on function public.documio_create_journal(uuid,date,text,uuid,uuid,numeric)
 from public,anon;
grant execute on function public.documio_create_journal(uuid,date,text,uuid,uuid,numeric)
 to authenticated;

create view public.professional_ledger_totals with(security_invoker=true) as
 select a.studio_id,a.client_id,a.id as account_id,a.code,a.name,
  a.account_type,
  coalesce(sum(case when e.status='posted' then l.debit else 0 end),0)::numeric(18,2) as debit,
  coalesce(sum(case when e.status='posted' then l.credit else 0 end),0)::numeric(18,2) as credit
 from public.professional_ledger_accounts a
 left join public.professional_journal_lines l on l.account_id=a.id
 left join public.professional_journal_entries e on e.id=l.entry_id
 group by a.studio_id,a.client_id,a.id,a.code,a.name,a.account_type;
revoke all on public.professional_ledger_totals from anon,authenticated;
grant select on public.professional_ledger_totals to authenticated;

-- Separate VAT register: numbers are indicative until reviewed; never auto-LIPE.
create table public.professional_vat_items (
 id uuid primary key default gen_random_uuid(),
 studio_id uuid not null,
 client_id uuid not null,
 period text not null check(period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 direction text not null check(direction in ('sale','purchase')),
 description text not null check(length(trim(description)) between 3 and 230),
 taxable numeric(14,2) not null check(taxable>=0),
 vat numeric(14,2) not null check(vat>=0),
 document_id uuid,
 status text not null default 'needs_review' check(status in ('needs_review','confirmed')),
 created_by uuid references auth.users(id) on delete set null,
 confirmed_by uuid references auth.users(id) on delete set null,
 confirmed_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key(client_id,studio_id) references public.professional_clients(id,studio_id),
 foreign key(document_id,studio_id,client_id) references public.professional_documents(id,studio_id,client_id)
);
create index professional_vat_period_idx on public.professional_vat_items(client_id,period);
create function documio_internal.professional_vat_guard()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if tg_op='UPDATE' and (new.studio_id is distinct from old.studio_id
  or new.client_id is distinct from old.client_id
  or new.created_by is distinct from old.created_by) then
   raise exception 'Registro IVA non trasferibile tra clienti';
 end if;
 if tg_op='UPDATE' and old.status='confirmed' then
   raise exception 'Voce IVA confermata immutabile: creare rettifica';
 end if;
 if new.status='confirmed' then
   if documio_internal.professional_role(new.studio_id) not in ('owner','professional')
      or not documio_internal.professional_client_access(new.client_id,true) then
      raise exception 'Conferma IVA riservata al professionista';
   end if;
   new.confirmed_by:=auth.uid();new.confirmed_at:=now();
 else
   new.confirmed_by:=null;new.confirmed_at:=null;
 end if;
 return new;
end;
$$;
revoke all on function documio_internal.professional_vat_guard() from public,anon;
create trigger professional_vat_guard before insert or update on public.professional_vat_items
 for each row execute function documio_internal.professional_vat_guard();
alter table public.professional_vat_items enable row level security;
create policy professional_vat_read on public.professional_vat_items
 for select to authenticated
 using(documio_internal.professional_client_access(client_id,false));
create policy professional_vat_write on public.professional_vat_items
 for insert to authenticated
 with check(documio_internal.professional_client_access(client_id,true) and created_by=auth.uid());
create policy professional_vat_edit on public.professional_vat_items
 for update to authenticated
 using(documio_internal.professional_client_access(client_id,true))
 with check(documio_internal.professional_client_access(client_id,true));
revoke all on public.professional_vat_items from anon,authenticated;
grant select,insert on public.professional_vat_items to authenticated;
grant update(status) on public.professional_vat_items to authenticated;
grant all on public.professional_vat_items to service_role;

-- Case checklists: evidence must be an original ALREADY linked to same case.
create table public.professional_case_requirements (
 id uuid primary key default gen_random_uuid(),
 studio_id uuid not null,
 client_id uuid not null,
 case_id uuid not null,
 requirement_code text not null check(length(requirement_code) between 2 and 60),
 label text not null check(length(trim(label)) between 3 and 220),
 mandatory boolean not null default true,
 status text not null default 'missing' check(status in
   ('missing','provided','verified','not_applicable')),
 document_id uuid,
 notes text,
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(case_id,requirement_code),
 foreign key(case_id,studio_id,client_id) references public.professional_cases(id,studio_id,client_id) on delete cascade,
 foreign key(document_id,case_id) references public.professional_document_case_links(document_id,case_id),
 check((status in ('provided','verified') and document_id is not null)
   or status in ('missing','not_applicable'))
);
create index professional_requirements_case_idx on public.professional_case_requirements(case_id,status);
create function documio_internal.professional_requirement_guard()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if tg_op='UPDATE' and
  (new.studio_id is distinct from old.studio_id or new.client_id is distinct from old.client_id
   or new.case_id is distinct from old.case_id) then
   raise exception 'Requisito non trasferibile tra clienti e pratiche';
 end if;
 if new.status in ('verified','not_applicable') then
   if documio_internal.professional_role(new.studio_id) not in ('owner','professional')
     or not documio_internal.professional_client_access(new.client_id,true) then
     raise exception 'Verifica del requisito riservata al professionista';
   end if;
   if tg_op='INSERT' or old.status is distinct from new.status then
     new.reviewed_by:=auth.uid();new.reviewed_at:=now();
   end if;
 else
   new.reviewed_by:=null;new.reviewed_at:=null;
 end if;
 return new;
end;
$$;
revoke all on function documio_internal.professional_requirement_guard() from public,anon;
create trigger professional_requirement_guard before insert or update on public.professional_case_requirements
 for each row execute function documio_internal.professional_requirement_guard();
alter table public.professional_case_requirements enable row level security;
create policy professional_req_read on public.professional_case_requirements
 for select to authenticated
 using(documio_internal.professional_client_access(client_id,false));
create policy professional_req_write on public.professional_case_requirements
 for insert to authenticated
 with check(documio_internal.professional_client_access(client_id,true));
create policy professional_req_edit on public.professional_case_requirements
 for update to authenticated
 using(documio_internal.professional_client_access(client_id,true))
 with check(documio_internal.professional_client_access(client_id,true));
revoke all on public.professional_case_requirements from anon,authenticated;
grant select,insert on public.professional_case_requirements to authenticated;
grant update(status,document_id,notes) on public.professional_case_requirements to authenticated;
grant all on public.professional_case_requirements to service_role;

-- Legal calendar: dates come from an operator, not fabricated from AI.
create table public.professional_legal_events (
 id uuid primary key default gen_random_uuid(),
 studio_id uuid not null,
 client_id uuid not null,
 case_id uuid not null,
 event_date date not null,
 event_type text not null check(event_type in
  ('fatto','udienza','deposito','notifica','comunicazione','altro')),
 title text not null check(length(trim(title)) between 3 and 200),
 notes text,
 date_status text not null default 'da_verificare'
  check(date_status in ('da_verificare','confermata_dal_professionista')),
 document_id uuid,
 created_by uuid references auth.users(id) on delete set null,
 confirmed_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 foreign key(case_id,studio_id,client_id) references public.professional_cases(id,studio_id,client_id),
 foreign key(document_id,case_id) references public.professional_document_case_links(document_id,case_id)
);
create index professional_legal_case_date_idx on public.professional_legal_events(case_id,event_date);
create function documio_internal.professional_legal_guard()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare ctype text;
begin
 select case_type into ctype from public.professional_cases where id=new.case_id;
 if ctype not in ('contenzioso','contratto','successione') then
   raise exception 'Cronologia legale non applicabile a questa pratica';
 end if;
 if new.date_status='confermata_dal_professionista' then
   if documio_internal.professional_role(new.studio_id) not in ('owner','professional')
     or not documio_internal.professional_client_access(new.client_id,true) then
     raise exception 'Conferma data riservata al professionista';
   end if;
   new.confirmed_by:=auth.uid();
 else
   new.confirmed_by:=null;
 end if;
 return new;
end;
$$;
revoke all on function documio_internal.professional_legal_guard() from public,anon;
create trigger professional_legal_guard before insert on public.professional_legal_events
 for each row execute function documio_internal.professional_legal_guard();
alter table public.professional_legal_events enable row level security;
create policy professional_legal_read on public.professional_legal_events
 for select to authenticated
 using(documio_internal.professional_client_access(client_id,false));
create policy professional_legal_add on public.professional_legal_events
 for insert to authenticated
 with check(documio_internal.professional_client_access(client_id,true) and created_by=auth.uid());
revoke all on public.professional_legal_events from anon,authenticated;
grant select,insert on public.professional_legal_events to authenticated;
grant all on public.professional_legal_events to service_role;

commit;
