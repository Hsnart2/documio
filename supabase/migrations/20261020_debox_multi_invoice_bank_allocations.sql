-- DocuMio: riconciliazione acconti/partite multi-fattura, con controlli
-- serializzati su banca e fattura. NON crea bonifici né chiude fatture
-- sulla sola causale. Migrazione additiva alla contabilità aziendale.
begin;

-- Requested history is bounded by institution capabilities. The authorization
-- is completed only by the account holder on the bank/provider website.
alter table public.financial_bank_connections
  add column if not exists history_days integer not null default 90
    check(history_days between 1 and 730);

-- Existing matches all refer to one invoice. Lift the *single movement* limit,
-- retaining all historical rows; enforce amounts in a concurrency-safe trigger.
alter table public.financial_matches
  drop constraint if exists financial_matches_user_id_transaction_id_key;
-- A pair may legitimately be funded by multiple manual confirmations.
-- Uniqueness is enforced by payment/invoice caps, never by a restrictive key.
create index if not exists financial_matches_invoice_transaction_idx
  on public.financial_matches(user_id,invoice_id,transaction_id);
alter table public.financial_matches
  add column if not exists matching_method text not null default 'manual'
  check (matching_method in ('manual','reviewed_suggestion'));

create or replace function public.documio_financial_match_guard()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare
  inv record; tx record;
  total_on_invoice numeric(18,2);
  total_on_bank numeric(18,2);
begin
  if tg_op='UPDATE' then
    raise exception 'Un abbinamento confermato non si modifica: revocalo e ricrealo';
  end if;
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Sessione non autorizzata' using errcode='42501';
  end if;
  -- Always lock bank first, then invoice, to prevent parallel over-allocations.
  select user_id,company_id,amount,currency into tx
  from public.financial_transactions
  where id=new.transaction_id and user_id=new.user_id for update;
  select user_id,company_id,direction,amount,currency into inv
  from public.financial_invoices
  where id=new.invoice_id and user_id=new.user_id for update;
  if not found or tx is null or inv is null then
    raise exception 'Fattura o movimento non presenti';
  end if;
  if inv.user_id is distinct from tx.user_id or
     inv.company_id is distinct from tx.company_id or
     inv.company_id is distinct from new.company_id then
    raise exception 'Abbinamento tra aziende diverse vietato';
  end if;
  if inv.currency <> tx.currency or
      (inv.direction='income' and tx.amount<=0) or
      (inv.direction='expense' and tx.amount>=0) then
    raise exception 'Entrata/uscita o valuta incompatibili';
  end if;
  if new.allocated_amount<=0 or
    round(new.allocated_amount,2)<>new.allocated_amount then
    raise exception 'Quota imputata non valida';
  end if;
  select coalesce(sum(allocated_amount),0) into total_on_invoice
    from public.financial_matches
    where invoice_id=new.invoice_id and user_id=new.user_id;
  select coalesce(sum(allocated_amount),0) into total_on_bank
    from public.financial_matches
    where transaction_id=new.transaction_id and user_id=new.user_id;
  if total_on_invoice+new.allocated_amount > inv.amount then
    raise exception 'Impossibile attribuire oltre il residuo della fattura';
  end if;
  if total_on_bank+new.allocated_amount > abs(tx.amount) then
    raise exception 'Impossibile attribuire oltre il bonifico ricevuto o inviato';
  end if;
  return new;
end;
$$;

-- Review state for cash movements not yet attributable to an invoice:
-- 'advance' includes e.g. "ACCONTO FATTURE" with no invoice references.
create table if not exists public.financial_transaction_reviews (
  transaction_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid,
  classification text not null default 'to_review'
    check(classification in ('to_review','advance','non_invoice',
      'own_transfer','invoice_payment')),
  note text not null default '' check(length(note)<=800),
  reviewed_at timestamptz not null default now(),
  primary key(transaction_id,user_id),
  foreign key(transaction_id,user_id)
    references public.financial_transactions(id,user_id) on delete cascade,
  foreign key(company_id,user_id)
    references public.financial_companies(id,user_id) on delete restrict
);
create index if not exists financial_reviews_company_idx
  on public.financial_transaction_reviews(user_id,company_id,classification);

create function documio_internal.financial_review_scope_guard()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare tx record;
begin
  if tg_op='UPDATE' and
    (new.user_id is distinct from old.user_id or
     new.transaction_id is distinct from old.transaction_id) then
     raise exception 'Spostamento di revisione bancaria non consentito';
  end if;
  select user_id,company_id into tx
    from public.financial_transactions
    where id=new.transaction_id and user_id=new.user_id;
  if not found or tx.company_id is distinct from new.company_id then
    raise exception 'Revisione bancaria di altra azienda';
  end if;
  new.reviewed_at=now();
  return new;
end;
$$;
revoke all on function documio_internal.financial_review_scope_guard()
  from public,anon;
create trigger financial_review_scope_guard
 before insert or update on public.financial_transaction_reviews
 for each row execute function documio_internal.financial_review_scope_guard();
alter table public.financial_transaction_reviews enable row level security;
create policy financial_transaction_reviews_owner
 on public.financial_transaction_reviews for all to authenticated
 using(user_id=(select auth.uid()))
 with check(user_id=(select auth.uid()));
revoke all on public.financial_transaction_reviews from anon,authenticated;
grant select,insert,update,delete on public.financial_transaction_reviews to authenticated;
grant all on public.financial_transaction_reviews to service_role;

-- Append-only audit; reviewer can see who confirmed/revoked a bank allocation.
create table if not exists public.financial_match_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid,
  invoice_id uuid not null,
  transaction_id uuid not null,
  allocated_amount numeric(14,2) not null,
  action text not null check(action in ('confirm','revoke')),
  matching_method text not null default 'manual',
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(company_id,user_id)
    references public.financial_companies(id,user_id) on delete cascade
);
create index if not exists financial_match_audit_company_idx
 on public.financial_match_audit(user_id,company_id,created_at desc);
alter table public.financial_match_audit enable row level security;
create policy financial_match_audit_owner on public.financial_match_audit
  for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.financial_match_audit from anon,authenticated;
grant select on public.financial_match_audit to authenticated;
grant all on public.financial_match_audit to service_role;

create function documio_internal.financial_match_audit_trigger()
returns trigger language plpgsql security definer set search_path=''
as $$
declare item record;
begin
  if tg_op='INSERT' then item:=new; else item:=old; end if;
  insert into public.financial_match_audit(
    user_id,company_id,invoice_id,transaction_id,allocated_amount,
    action,matching_method,actor_id
  ) values(
    item.user_id,item.company_id,item.invoice_id,item.transaction_id,
    item.allocated_amount,
    case when tg_op='INSERT' then 'confirm' else 'revoke' end,
    coalesce(item.matching_method,'manual'),auth.uid()
  );
  return coalesce(new,old);
end;
$$;
revoke all on function documio_internal.financial_match_audit_trigger()
 from public,anon;
create trigger financial_match_audit_trigger
 after insert or delete on public.financial_matches
 for each row execute function documio_internal.financial_match_audit_trigger();

-- Atomic, authenticated allocation of a single bank transfer to 1..20 invoices.
-- Calling code sends suggestions for human review; this function only CONFIRMS
-- after a direct user action. Account access remains RLS-scoped.
create function public.documio_confirm_bank_allocations(
  p_transaction_id uuid,p_allocations jsonb,
  p_matching_method text default 'manual'
)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
  tx record; inv record; item jsonb;
  inv_id uuid; amount numeric(14,2);
  created jsonb:='[]'::jsonb;
  used_amount numeric(18,2);
begin
  if auth.uid() is null then
    raise exception 'Devi accedere a DocuMio' using errcode='42501';
  end if;
  if p_matching_method not in ('manual','reviewed_suggestion') then
    raise exception 'Origine abbinamento non riconosciuta';
  end if;
  if jsonb_typeof(p_allocations)<>'array'
     or jsonb_array_length(p_allocations)<1
     or jsonb_array_length(p_allocations)>20 then
    raise exception 'Assegna da 1 a 20 fatture per bonifico';
  end if;
  select t.id,t.user_id,t.company_id,t.amount,t.currency into tx
    from public.financial_transactions as t
    where t.id=p_transaction_id and t.user_id=auth.uid() for update;
  if not found then
    raise exception 'Movimento bancario non accessibile' using errcode='42501';
  end if;
  if (select count(distinct value->>'invoiceId')
        from jsonb_array_elements(p_allocations) as batch(value))
      <>jsonb_array_length(p_allocations) then
    raise exception 'Non ripetere una fattura nella stessa conferma';
  end if;
  -- Sorting makes concurrent requests for the same invoices deterministic.
  for item in select value from jsonb_array_elements(p_allocations) as t(value)
    order by value->>'invoiceId'
  loop
    if jsonb_typeof(item)<>'object' or
       coalesce(item->>'invoiceId','') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or
       coalesce(item->>'amount','') !~ '^[0-9]+(\.[0-9]{1,2})?$' then
       raise exception 'Fattura o importo non valido';
    end if;
    inv_id:=(item->>'invoiceId')::uuid;
    amount:=(item->>'amount')::numeric(14,2);
    if amount<=0 then raise exception 'Importo non valido'; end if;
    select i.id,i.user_id,i.company_id,i.amount,i.currency,i.direction into inv
      from public.financial_invoices as i
      where i.id=inv_id and i.user_id=auth.uid() for update;
    if not found or inv.company_id is distinct from tx.company_id then
      raise exception 'Fattura inesistente o di altra azienda';
    end if;
    insert into public.financial_matches(
      user_id,company_id,invoice_id,transaction_id,allocated_amount,
      matching_method
    ) values(
      auth.uid(),tx.company_id,inv_id,tx.id,amount,p_matching_method
    );
    created:=created || jsonb_build_array(
      jsonb_build_object('invoiceId',inv_id,'amount',amount)
    );
  end loop;
  select coalesce(sum(m.allocated_amount),0) into used_amount
    from public.financial_matches m
    where m.transaction_id=tx.id and m.user_id=auth.uid();
  return jsonb_build_object(
    'confirmations',created,
    'unallocated',greatest(0,abs(tx.amount)-used_amount),
    'bankAmount',abs(tx.amount)
  );
end;
$$;
revoke all on function public.documio_confirm_bank_allocations(uuid,jsonb,text)
 from public,anon;
grant execute on function public.documio_confirm_bank_allocations(uuid,jsonb,text)
 to authenticated;

commit;
