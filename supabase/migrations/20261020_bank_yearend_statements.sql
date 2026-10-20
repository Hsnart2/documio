-- DocuMio: saldi bancari di chiusura riportati dall'estratto conto, per azienda.
-- Non alterare alcun saldo storico e non supporre copertura PSD2 completa.
begin;

create table if not exists public.financial_bank_yearend_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null,
  fiscal_year integer not null check (fiscal_year between 2000 and 2100),
  account_label text not null check (length(trim(account_label)) between 2 and 80),
  opening_balance numeric(14,2),
  closing_balance numeric(14,2) not null,
  currency text not null default 'EUR' check (currency='EUR'),
  statement_document_id uuid references public.documents(id) on delete set null,
  provenance text not null default 'manual_from_statement'
    check (provenance = 'manual_from_statement'),
  entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, company_id, fiscal_year, account_label),
  foreign key (company_id,user_id)
    references public.financial_companies(id,user_id) on delete restrict
);
create index if not exists bank_yearend_company_year_idx
 on public.financial_bank_yearend_balances(user_id,company_id,fiscal_year);

-- I documenti di prova devono appartenere alla stessa azienda e allo stesso
-- proprietario; le letture di dati bancari seguono le RLS aziendali.
create function documio_internal.bank_yearend_scope_guard()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare d_user uuid; d_company uuid;
begin
 if tg_op='UPDATE' and (new.user_id is distinct from old.user_id
   or new.company_id is distinct from old.company_id) then
   raise exception 'Impossibile spostare il saldo tra aziende';
 end if;
 if new.statement_document_id is not null then
   select user_id, company_id into d_user,d_company
    from public.documents where id=new.statement_document_id;
   if d_user is distinct from new.user_id or
      d_company is distinct from new.company_id then
     raise exception 'Estratto conto e azienda appartengono ad archivi diversi';
   end if;
 end if;
 new.updated_at=now();
 return new;
end;
$$;
revoke all on function documio_internal.bank_yearend_scope_guard() from public,anon;
create trigger bank_yearend_scope_guard
 before insert or update on public.financial_bank_yearend_balances
 for each row execute function documio_internal.bank_yearend_scope_guard();

create function documio_internal.bank_yearend_document_guard()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if (new.user_id is distinct from old.user_id
  or new.company_id is distinct from old.company_id)
  and exists(select 1 from public.financial_bank_yearend_balances b
    where b.statement_document_id=old.id) then
    raise exception 'Scollega prima l estratto conto dalle chiusure bancarie';
 end if;
 return new;
end;
$$;
revoke all on function documio_internal.bank_yearend_document_guard() from public,anon;
create trigger bank_yearend_document_guard
 before update of user_id,company_id on public.documents
 for each row execute function documio_internal.bank_yearend_document_guard();

alter table public.financial_bank_yearend_balances enable row level security;
create policy financial_bank_yearend_owner on public.financial_bank_yearend_balances
 for all to authenticated
 using(user_id=(select auth.uid()))
 with check(user_id=(select auth.uid()));
revoke all on public.financial_bank_yearend_balances from anon,authenticated;
grant select,insert,update,delete on public.financial_bank_yearend_balances to authenticated;
grant all on public.financial_bank_yearend_balances to service_role;
commit;
