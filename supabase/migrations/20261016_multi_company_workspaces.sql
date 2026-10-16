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

commit;
