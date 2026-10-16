-- DocuMio: controllo impronta SHA-256 per singolo ambito e rubrica fornitori.
-- Migrazione solo additiva: i documenti e le fatture storiche restano invariati.
begin;

alter table public.documents
  add column if not exists file_sha256 text,
  add column if not exists file_hash_checked_at timestamptz,
  add column if not exists duplicate_of uuid references public.documents(id) on delete set null;
alter table public.documents drop constraint if exists documents_file_sha256_format_check;
alter table public.documents add constraint documents_file_sha256_format_check
  check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$');
create index if not exists documents_sha256_scope_idx
  on public.documents(user_id,company_id,file_sha256)
  where file_sha256 is not null;

-- Un duplicato dichiarato deve appartenere allo stesso utente e alla stessa
-- azienda. Non si impone unicità del contenuto: si può conservare una
-- seconda copia SOLO se l'utente lo decide esplicitamente.
create or replace function public.documio_duplicate_reference_guard()
returns trigger language plpgsql security invoker set search_path=public as $$
declare original_user uuid; original_company uuid; original_sha text;
begin
  if new.duplicate_of is not null then
    if new.id = new.duplicate_of then
      raise exception 'Un documento non puo duplicare se stesso';
    end if;
    select user_id,company_id,file_sha256 into original_user,original_company,original_sha
      from public.documents where id=new.duplicate_of;
    if original_user is distinct from new.user_id or
       original_company is distinct from new.company_id or
       original_sha is distinct from new.file_sha256 then
      raise exception 'Documento duplicato non appartenente allo stesso archivio e contenuto';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.documio_duplicate_reference_guard() from public,anon;
drop trigger if exists documio_duplicate_reference_guard on public.documents;
create trigger documio_duplicate_reference_guard before insert or update
on public.documents for each row execute function public.documio_duplicate_reference_guard();

create table if not exists public.financial_suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null,
  legal_name text not null check (length(trim(legal_name)) between 2 and 220),
  vat_number text,
  default_category text not null default 'da_verificare'
    check (default_category in (
      'materie_prime','acquisti_merci','leasing','affitti_canoni',
      'trasporti','carburanti','manutenzioni','utenze','smaltimento',
      'stipendi','contributi','conai','iva','imposte','consulenze',
      'assicurazioni','interessi','marketing','software','rimborsi',
      'altre_spese','da_verificare'
    )),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id,company_id),
  foreign key (company_id,user_id) references public.financial_companies(id,user_id) on delete cascade
);
create unique index if not exists financial_suppliers_company_name_unique
  on public.financial_suppliers(company_id,lower(trim(legal_name)));
create unique index if not exists financial_suppliers_company_vat_unique
  on public.financial_suppliers(company_id,vat_number)
  where vat_number is not null and vat_number <> '';
create index if not exists financial_suppliers_user_company_idx
  on public.financial_suppliers(user_id,company_id,default_category);

alter table public.financial_suppliers enable row level security;
drop policy if exists financial_suppliers_owner on public.financial_suppliers;
create policy financial_suppliers_owner on public.financial_suppliers
for all to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);
revoke all on public.financial_suppliers from anon,authenticated;
grant select,insert,update,delete on public.financial_suppliers to authenticated;
grant all on public.financial_suppliers to service_role;

alter table public.financial_invoices
  add column if not exists supplier_id uuid,
  add column if not exists category_source text not null default 'rule',
  add column if not exists classification_reason text,
  add column if not exists classification_confidence smallint,
  add column if not exists invoice_description text;

alter table public.financial_invoices drop constraint if exists financial_invoices_category_source_check;
alter table public.financial_invoices add constraint financial_invoices_category_source_check
  check (category_source in ('rule','description','supplier','manual','unclassified'));
alter table public.financial_invoices drop constraint if exists financial_invoices_classification_confidence_check;
alter table public.financial_invoices add constraint financial_invoices_classification_confidence_check
  check (classification_confidence is null or classification_confidence between 0 and 100);
alter table public.financial_invoices drop constraint if exists financial_invoices_supplier_requires_company_check;
alter table public.financial_invoices add constraint financial_invoices_supplier_requires_company_check
  check (supplier_id is null or company_id is not null);
alter table public.financial_invoices
  add constraint financial_invoices_supplier_owner_fk
  foreign key (supplier_id,user_id,company_id)
  references public.financial_suppliers(id,user_id,company_id) on delete restrict;
create index if not exists financial_invoices_supplier_idx
  on public.financial_invoices(user_id,company_id,supplier_id);

-- Un'istruzione approvata in Fornitori si applica a tutte le fatture
-- RICEVUTE dello stesso fornitore, vecchie e nuove. Non sovrascrive
-- correzioni esplicitamente manuali o descrizioni specifiche,
-- a meno che l'utente scelga di riclassificare anche quelle.
create or replace function public.documio_apply_supplier_category(
  p_supplier_id uuid,
  p_include_manual boolean default false
) returns integer
language plpgsql security invoker set search_path=public as $$
declare selected public.financial_suppliers%rowtype; changed integer;
begin
  select * into selected from public.financial_suppliers
    where id=p_supplier_id and user_id=(select auth.uid());
  if not found then raise exception 'Fornitore non disponibile'; end if;
  if selected.default_category='da_verificare' then return 0; end if;
  update public.financial_invoices as inv
  set supplier_id=selected.id,
      cost_category=selected.default_category,
      category_status='confirmed',
      category_source='supplier',
      classification_reason='Categoria scelta nella rubrica Fornitori',
      classification_confidence=100
  where inv.user_id=selected.user_id
    and inv.company_id=selected.company_id
    and inv.direction='expense'
    and (
      (nullif(trim(coalesce(selected.vat_number,'')),'') is not null
        and upper(regexp_replace(coalesce(inv.vat_number,''),'[^[:alnum:]]','','g'))
          = upper(regexp_replace(selected.vat_number,'[^[:alnum:]]','','g')))
      or (
        length(trim(selected.legal_name)) >= 3
        and lower(regexp_replace(inv.counterparty,'[^[:alnum:]]','','g'))
         = lower(regexp_replace(selected.legal_name,'[^[:alnum:]]','','g'))
      )
    )
    and (p_include_manual or
      (inv.category_source not in ('manual','description') and
       (inv.category_status <> 'confirmed' or inv.category_source='supplier')));
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.documio_apply_supplier_category(uuid,boolean) from public,anon;
grant execute on function public.documio_apply_supplier_category(uuid,boolean) to authenticated;

commit;
