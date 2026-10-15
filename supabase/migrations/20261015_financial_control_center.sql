-- DocuMio: Centro di controllo finanziario / scadenze.
-- Applicare manualmente nel progetto Supabase PRIMA di abilitare l'interfaccia.
-- Nessun accesso ai dati bancari senza consenso esplicito dell'utente.
begin;

create table if not exists public.financial_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('income','expense')),
  source text not null default 'manual' check (source in ('manual','xml')),
  invoice_number text not null,
  document_id uuid references public.documents(id) on delete set null,
  issue_date date not null,
  due_date date,
  counterparty text not null,
  vat_number text,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  import_key text,
  notes text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, import_key),
  unique (user_id, document_id)
);

-- Impedisce il collegamento a un documento di un altro utente.
-- Il controllo si applica a INSERT e UPDATE e usa sempre l'utente proprietario.
create or replace function public.documio_financial_invoice_doc_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.document_id is not null
    and not exists (
      select 1 from public.documents
      where id = new.document_id and user_id = new.user_id
    ) then
    raise exception 'Il documento non appartiene all’utente';
  end if;
  return new;
end;
$$;

drop trigger if exists documio_financial_invoice_doc_guard on public.financial_invoices;
create trigger documio_financial_invoice_doc_guard before insert or update
on public.financial_invoices for each row
execute function public.documio_financial_invoice_doc_guard();

create table if not exists public.financial_bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'gocardless' check (provider = 'gocardless'),
  institution_id text not null,
  institution_name text not null,
  requisition_id uuid not null unique,
  consent_status text not null default 'pending'
    check (consent_status in ('pending','linked','expired','rejected')),
  last_sync_at timestamptz,
  balances jsonb not null default '[]'::jsonb check (jsonb_typeof(balances) = 'array'),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_connection_id uuid,
  source text not null check (source in ('csv','gocardless')),
  account_label text,
  booking_date date not null,
  amount numeric(14,2) not null check (amount <> 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  counterparty text,
  description text not null default '',
  import_key text not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, import_key),
  foreign key (bank_connection_id, user_id)
    references public.financial_bank_connections(id, user_id) on delete cascade,
  check ((source = 'gocardless' and bank_connection_id is not null)
      or (source = 'csv' and bank_connection_id is null))
);

create table if not exists public.financial_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null,
  transaction_id uuid not null,
  allocated_amount numeric(14,2) not null check (allocated_amount > 0),
  confirmed_at timestamptz not null default now(),
  unique (user_id, transaction_id),
  foreign key (invoice_id, user_id)
    references public.financial_invoices(id, user_id) on delete cascade,
  foreign key (transaction_id, user_id)
    references public.financial_transactions(id, user_id) on delete cascade
);

create table if not exists public.financial_deadlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in
    ('bollo','multa','imposta','assicurazione','contratto','fattura','altro')),
  title text not null,
  due_date date not null,
  amount numeric(14,2) check (amount is null or amount >= 0),
  reference_code text,
  status text not null default 'open' check (status in ('open','settled','cancelled')),
  source text not null default 'manual' check (source = 'manual'),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists financial_invoices_due_idx
  on public.financial_invoices(user_id, due_date);
create index if not exists financial_txn_booking_idx
  on public.financial_transactions(user_id, booking_date desc);
create index if not exists financial_matches_invoice_idx
  on public.financial_matches(user_id, invoice_id);
create index if not exists financial_deadlines_due_idx
  on public.financial_deadlines(user_id, due_date)
  where status = 'open';

-- Un movimento non può essere imputato due volte; un importo non può superare
-- il valore della fattura. Anche segno e valuta devono essere coerenti.
create or replace function public.documio_financial_match_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  invoice_row record;
  transaction_row record;
  already_allocated numeric(14,2);
begin
  select direction, amount, currency into invoice_row
    from public.financial_invoices
    where id = new.invoice_id and user_id = new.user_id for update;
  select amount, currency into transaction_row
    from public.financial_transactions
    where id = new.transaction_id and user_id = new.user_id;

  if invoice_row is null or transaction_row is null then
    raise exception 'Fattura o movimento non disponibili';
  end if;
  if invoice_row.currency <> transaction_row.currency
    or (invoice_row.direction = 'income' and transaction_row.amount <= 0)
    or (invoice_row.direction = 'expense' and transaction_row.amount >= 0) then
    raise exception 'Segno o valuta non compatibili';
  end if;
  if new.allocated_amount > abs(transaction_row.amount) + 0.01 then
    raise exception 'Importo abbinato superiore al movimento bancario';
  end if;
  select coalesce(sum(allocated_amount), 0) into already_allocated
    from public.financial_matches where invoice_id = new.invoice_id
    and id is distinct from new.id;
  if already_allocated + new.allocated_amount > invoice_row.amount + 0.01 then
    raise exception 'Importo abbinato superiore alla fattura';
  end if;
  return new;
end;
$$;

drop trigger if exists documio_financial_match_guard on public.financial_matches;
create trigger documio_financial_match_guard before insert or update
on public.financial_matches for each row
execute function public.documio_financial_match_guard();

alter table public.financial_invoices enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.financial_matches enable row level security;
alter table public.financial_deadlines enable row level security;
alter table public.financial_bank_connections enable row level security;

drop policy if exists invoices_own on public.financial_invoices;
create policy invoices_own on public.financial_invoices for all to authenticated
  using (auth.uid() = user_id) with check
  (auth.uid() = user_id and source in ('manual','xml'));

drop policy if exists transactions_read_own on public.financial_transactions;
create policy transactions_read_own on public.financial_transactions
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists transactions_import_csv on public.financial_transactions;
create policy transactions_import_csv on public.financial_transactions
  for insert to authenticated
  with check (auth.uid() = user_id and source = 'csv' and bank_connection_id is null);
drop policy if exists transactions_remove_csv on public.financial_transactions;
create policy transactions_remove_csv on public.financial_transactions
  for delete to authenticated using (auth.uid() = user_id and source = 'csv');

drop policy if exists matches_own on public.financial_matches;
create policy matches_own on public.financial_matches for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists deadlines_own on public.financial_deadlines;
create policy deadlines_own on public.financial_deadlines for all to authenticated
  using (auth.uid() = user_id) with check
  (auth.uid() = user_id and source = 'manual');

drop policy if exists bank_connections_read_own on public.financial_bank_connections;
create policy bank_connections_read_own on public.financial_bank_connections
  for select to authenticated using (auth.uid() = user_id);
-- Scrittura connessioni e transazioni Open Banking: esclusivamente sul server.
grant select,insert,update,delete on public.financial_invoices to authenticated;
grant select,insert,delete on public.financial_transactions to authenticated;
grant select,insert,update,delete on public.financial_matches to authenticated;
grant select,insert,update,delete on public.financial_deadlines to authenticated;
grant select on public.financial_bank_connections to authenticated;
grant all on public.financial_invoices, public.financial_transactions,
  public.financial_matches, public.financial_deadlines,
  public.financial_bank_connections to service_role;
commit;
