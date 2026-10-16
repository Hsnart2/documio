-- DocuMio: archivi distinti per persona/azienda, contabilità verificabile.
-- Migrazione additiva: tutti i documenti già esistenti restano "personali"
-- (company_id = NULL). Nessuna modifica ai saldi o ai pagamenti esistenti.
begin;

create table if not exists public.financial_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  legal_name text not null check (length(trim(legal_name)) between 2 and 180),
  vat_number text,
  tax_code text,
  legal_form text,
  fiscal_year_end text not null default '12-31'
    check (fiscal_year_end ~ '^([01][0-9])-([0-3][0-9])$'),
  address text,
  activity text,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

alter table public.financial_companies enable row level security;
drop policy if exists financial_companies_own on public.financial_companies;
create policy financial_companies_own on public.financial_companies
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.financial_companies from anon, authenticated;
grant select, insert, update on public.financial_companies to authenticated;
grant all on public.financial_companies to service_role;

-- Lo stesso utente può gestire più aziende, ma non può attribuire
-- a un'impresa record appartenenti a un altro proprietario.
alter table public.documents add column if not exists company_id uuid;
alter table public.practices add column if not exists company_id uuid;
alter table public.financial_invoices add column if not exists company_id uuid;
alter table public.financial_transactions add column if not exists company_id uuid;
alter table public.financial_matches add column if not exists company_id uuid;
alter table public.financial_deadlines add column if not exists company_id uuid;
alter table public.financial_bank_connections add column if not exists company_id uuid;

alter table public.documents add column if not exists financial_document_type text
  check (financial_document_type is null or financial_document_type in
    ('invoice_xml','invoice_pdf','bank_statement','payroll','f24','contract','other'));
alter table public.documents add column if not exists accounting_review_status text
  not null default 'not_applicable'
  check (accounting_review_status in ('not_applicable','needs_review','confirmed'));

alter table public.financial_invoices add column if not exists cost_category text;
alter table public.financial_invoices add column if not exists category_status text
  not null default 'needs_review'
  check (category_status in ('suggested','needs_review','confirmed'));
alter table public.financial_invoices add column if not exists vat_amount numeric(14,2)
  check (vat_amount is null or vat_amount >= 0);
alter table public.financial_transactions add column if not exists suggested_category text;
alter table public.financial_transactions add column if not exists category_status text
  not null default 'needs_review'
  check (category_status in ('suggested','needs_review','confirmed'));

alter table public.documents
  add constraint documents_company_owner_fk
  foreign key (company_id, user_id)
  references public.financial_companies(id,user_id) on delete restrict;
alter table public.practices
  add constraint practices_company_owner_fk
  foreign key (company_id, user_id)
  references public.financial_companies(id,user_id) on delete restrict;
alter table public.financial_invoices
  add constraint financial_invoices_company_owner_fk
  foreign key (company_id, user_id)
  references public.financial_companies(id,user_id) on delete restrict;
alter table public.financial_transactions
  add constraint financial_transactions_company_owner_fk
  foreign key (company_id, user_id)
  references public.financial_companies(id,user_id) on delete restrict;
alter table public.financial_matches
  add constraint financial_matches_company_owner_fk
  foreign key (company_id, user_id)
  references public.financial_companies(id,user_id) on delete restrict;
alter table public.financial_deadlines
  add constraint financial_deadlines_company_owner_fk
  foreign key (company_id, user_id)
  references public.financial_companies(id,user_id) on delete restrict;
alter table public.financial_bank_connections
  add constraint financial_bank_connections_company_owner_fk
  foreign key (company_id, user_id)
  references public.financial_companies(id,user_id) on delete restrict;

create index if not exists financial_invoices_workspace_idx
  on public.financial_invoices(user_id, company_id, issue_date desc);
create index if not exists financial_transactions_workspace_idx
  on public.financial_transactions(user_id, company_id, booking_date desc);
create index if not exists financial_deadlines_workspace_idx
  on public.financial_deadlines(user_id, company_id, due_date);
create index if not exists documents_workspace_idx
  on public.documents(user_id, company_id, uploaded_at desc);

-- I documenti collegati a una fattura devono appartenere alla stessa
-- impresa (o entrambi all'archivio personale).
create or replace function public.documio_invoice_workspace_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
declare owner_id uuid; scope_id uuid;
begin
  if new.document_id is not null then
    select d.user_id, d.company_id into owner_id, scope_id
    from public.documents as d where d.id = new.document_id;
    if owner_id is distinct from new.user_id or
       scope_id is distinct from new.company_id then
      raise exception 'Documento e fattura appartengono ad archivi diversi';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.documio_invoice_workspace_guard() from public, anon;
drop trigger if exists documio_invoice_workspace_guard on public.financial_invoices;
create trigger documio_invoice_workspace_guard
  before insert or update on public.financial_invoices
  for each row execute function public.documio_invoice_workspace_guard();

-- Gli abbinamenti contabili non possono mai attraversare due aziende
-- dell'utente, anche se il browser fosse manipolato.
create or replace function public.documio_match_workspace_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
declare inv_user uuid; tx_user uuid; inv_scope uuid; tx_scope uuid;
begin
  select user_id, company_id into inv_user, inv_scope from public.financial_invoices
    where id = new.invoice_id;
  select user_id, company_id into tx_user, tx_scope from public.financial_transactions
    where id = new.transaction_id;
  if inv_user is distinct from new.user_id or
     tx_user is distinct from new.user_id or
     inv_scope is distinct from tx_scope or
     new.company_id is distinct from inv_scope then
    raise exception 'Abbinamento tra archivi diversi non consentito';
  end if;
  return new;
end; $$;
revoke all on function public.documio_match_workspace_guard() from public, anon;
drop trigger if exists documio_match_workspace_guard on public.financial_matches;
create trigger documio_match_workspace_guard
  before insert or update on public.financial_matches
  for each row execute function public.documio_match_workspace_guard();

-- Registro documenti amministrativi: F24, buste paga, contratti, estratti
-- conto. Importi e causali sono provvisori fino a verifica umana.
create table if not exists public.financial_accounting_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid,
  document_id uuid references public.documents(id) on delete set null,
  record_type text not null check
    (record_type in ('payroll','f24','conai','bank_statement','contract','other')),
  category text not null default 'da_verificare',
  title text not null check (length(trim(title)) between 2 and 230),
  reference_period text,
  amount numeric(14,2) check (amount is null or amount >= 0),
  tax_amount numeric(14,2) check (tax_amount is null or tax_amount >= 0),
  due_date date,
  description text,
  review_status text not null default 'needs_review'
    check (review_status in ('needs_review','confirmed','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id,user_id) references public.financial_companies(id,user_id)
    on delete restrict
);

create or replace function public.documio_record_workspace_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
declare doc_user uuid; doc_scope uuid;
begin
  if new.document_id is not null then
    select user_id,company_id into doc_user,doc_scope
      from public.documents where id = new.document_id;
    if doc_user is distinct from new.user_id or
       doc_scope is distinct from new.company_id then
      raise exception 'Il documento non appartiene a questo archivio';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.documio_record_workspace_guard() from public, anon;
create trigger documio_record_workspace_guard
  before insert or update on public.financial_accounting_records
  for each row execute function public.documio_record_workspace_guard();

alter table public.financial_accounting_records enable row level security;
drop policy if exists financial_accounting_records_own on public.financial_accounting_records;
create policy financial_accounting_records_own
  on public.financial_accounting_records for all to authenticated
  using ((select auth.uid())=user_id)
  with check ((select auth.uid())=user_id);
revoke all on public.financial_accounting_records from anon, authenticated;
grant select,insert,update,delete on public.financial_accounting_records to authenticated;
grant all on public.financial_accounting_records to service_role;
create index if not exists financial_records_workspace_idx
  on public.financial_accounting_records(user_id,company_id,record_type,created_at desc);

-- I riferimenti pratica/documento non devono attraversare archivi.
-- Trigger anche sulle modifiche (non solo sul primo collegamento).
create or replace function public.documio_document_practice_scope_guard()
returns trigger language plpgsql security invoker set search_path=public as $$
declare practice_owner uuid; practice_scope uuid;
begin
  if new.company_id is not null and new.user_id is null then
    raise exception 'L archivio aziendale richiede il proprietario';
  end if;
  if new.practice_id is not null then
    select user_id, company_id into practice_owner, practice_scope
    from public.practices where id = new.practice_id;
    if practice_owner is distinct from new.user_id or
       practice_scope is distinct from new.company_id then
      raise exception 'Documento e pratica appartengono ad archivi diversi';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.documio_document_practice_scope_guard() from public,anon;
drop trigger if exists documio_document_practice_scope_guard on public.documents;
create trigger documio_document_practice_scope_guard
  before insert or update on public.documents
  for each row execute function public.documio_document_practice_scope_guard();

create or replace function public.documio_practice_company_change_guard()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if old.company_id is distinct from new.company_id and
     exists(select 1 from public.documents where practice_id=old.id) then
    raise exception 'Scollega i documenti prima di spostare la pratica';
  end if;
  return new;
end; $$;
revoke all on function public.documio_practice_company_change_guard() from public,anon;
create trigger documio_practice_company_change_guard
  before update of company_id on public.practices
  for each row execute function public.documio_practice_company_change_guard();

create or replace function public.documio_financial_scope_change_guard()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if old.company_id is distinct from new.company_id then
    if tg_table_name='financial_invoices' and
      exists(select 1 from public.financial_matches where invoice_id=old.id) then
      raise exception 'Non spostare fatture con pagamenti riconciliati';
    end if;
    if tg_table_name='financial_transactions' and
      exists(select 1 from public.financial_matches where transaction_id=old.id) then
      raise exception 'Non spostare movimenti con abbinamenti registrati';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.documio_financial_scope_change_guard() from public,anon;
create trigger documio_invoice_scope_change_guard
  before update of company_id on public.financial_invoices
  for each row execute function public.documio_financial_scope_change_guard();
create trigger documio_transaction_scope_change_guard
  before update of company_id on public.financial_transactions
  for each row execute function public.documio_financial_scope_change_guard();

-- Le revisioni AI dei contratti sono separate per azienda e proprietario.
-- L'utente può consultare i passaggi individuati, senza confonderli
-- con un parere legale asseverato o con una fonte normativa verificata.
create table if not exists public.financial_contract_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid,
  document_id uuid not null unique references public.documents(id) on delete cascade,
  review_data jsonb not null check (jsonb_typeof(review_data)='object'),
  model_name text not null default 'gpt-5-mini',
  status text not null default 'needs_review'
    check(status in ('needs_review','checked')),
  reviewed_at timestamptz not null default now(),
  foreign key (company_id,user_id)
    references public.financial_companies(id,user_id) on delete restrict
);
create or replace function public.documio_contract_review_scope_guard()
returns trigger language plpgsql security invoker set search_path=public as $$
declare doc_user uuid; doc_company uuid;
begin
  select user_id,company_id into doc_user,doc_company
    from public.documents where id=new.document_id;
  if doc_user is distinct from new.user_id or
     doc_company is distinct from new.company_id then
    raise exception 'La revisione riguarda un documento di altro archivio';
  end if;
  return new;
end; $$;
revoke all on function public.documio_contract_review_scope_guard() from public,anon;
create trigger documio_contract_review_scope_guard
  before insert or update on public.financial_contract_reviews
  for each row execute function public.documio_contract_review_scope_guard();
alter table public.financial_contract_reviews enable row level security;
create policy financial_contract_reviews_own on public.financial_contract_reviews
  for all to authenticated
  using((select auth.uid())=user_id)
  with check((select auth.uid())=user_id);
revoke all on public.financial_contract_reviews from anon,authenticated;
grant select,insert,update,delete on public.financial_contract_reviews to authenticated;
grant all on public.financial_contract_reviews to service_role;
create index if not exists financial_contract_reviews_owner_idx
  on public.financial_contract_reviews(user_id,company_id,reviewed_at desc);

-- Mai spostare un documento dopo che una scrittura contabile o revisione
-- gli è stata associata. Prima occorre una procedura esplicita di
-- riclassificazione con audit e verifica professionale.
create or replace function public.documio_document_scope_change_guard()
returns trigger language plpgsql security invoker set search_path=public as $
begin
  if old.company_id is distinct from new.company_id or
     old.user_id is distinct from new.user_id then
    if exists(select 1 from public.financial_invoices
              where document_id=old.id) or
       exists(select 1 from public.financial_accounting_records
              where document_id=old.id) or
       exists(select 1 from public.financial_contract_reviews
              where document_id=old.id) then
      raise exception 'Documento collegato a registrazioni: non puo essere spostato fra archivi';
    end if;
  end if;
  return new;
end; $;
revoke all on function public.documio_document_scope_change_guard() from public,anon;
drop trigger if exists documio_document_scope_change_guard on public.documents;
create trigger documio_document_scope_change_guard
  before update of company_id,user_id on public.documents
  for each row execute function public.documio_document_scope_change_guard();

commit;
