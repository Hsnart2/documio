-- Disposable CI database: legacy finance schemas with owner RLS.
create table public.financial_bank_connections(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 company_id uuid,
 institution_name text not null,
 unique(id,user_id),
 foreign key(company_id,user_id)
   references public.financial_companies(id,user_id)
);
create table public.financial_invoices(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 company_id uuid,
 invoice_number text not null,
 direction text not null check(direction in ('income','expense')),
 amount numeric(14,2) not null check(amount>0),
 currency text not null default 'EUR',
 unique(id,user_id),
 foreign key(company_id,user_id) references public.financial_companies(id,user_id)
);
create table public.financial_transactions(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 company_id uuid,
 amount numeric(14,2) not null check(amount<>0),
 currency text not null default 'EUR',
 unique(id,user_id),
 foreign key(company_id,user_id) references public.financial_companies(id,user_id)
);
create table public.financial_matches(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 company_id uuid,
 invoice_id uuid not null,
 transaction_id uuid not null,
 allocated_amount numeric(14,2) not null check(allocated_amount>0),
 confirmed_at timestamptz not null default now(),
 unique(user_id,transaction_id),
 foreign key(invoice_id,user_id) references public.financial_invoices(id,user_id),
 foreign key(transaction_id,user_id) references public.financial_transactions(id,user_id),
 foreign key(company_id,user_id) references public.financial_companies(id,user_id)
);
create function public.documio_financial_match_guard()
returns trigger language plpgsql security invoker set search_path=''
as $$begin return new;end;$$;
create trigger documio_financial_match_guard before insert or update
 on public.financial_matches for each row
 execute function public.documio_financial_match_guard();
alter table public.financial_bank_connections enable row level security;
alter table public.financial_invoices enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.financial_matches enable row level security;
create policy test_connections_own on public.financial_bank_connections for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy test_invoice_own on public.financial_invoices for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy test_transactions_own on public.financial_transactions for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy test_matches_own on public.financial_matches for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select,insert,delete,update on public.financial_matches,public.financial_invoices,
 public.financial_transactions,public.financial_bank_connections to authenticated;
-- Pre-migration legacy allocation must survive the constraint change.
insert into public.financial_invoices(id,user_id,company_id,invoice_number,direction,amount)
 values
 ('11110000-1111-4111-8111-111100000001',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A1','income',120),
 ('11110000-1111-4111-8111-111100000002',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A2','income',90),
 ('11110000-1111-4111-8111-111100000003',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Forn1','expense',50),
 ('22220000-2222-4222-8222-222200000001',
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Other','income',90);
insert into public.financial_transactions(id,user_id,company_id,amount)
 values
 ('33330000-3333-4333-8333-333300000001',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',150),
 ('33330000-3333-4333-8333-333300000002',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',40),
 ('33330000-3333-4333-8333-333300000003',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',-50),
 ('44440000-4444-4444-8444-444400000001',
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',100);
insert into public.financial_matches(user_id,company_id,invoice_id,transaction_id,allocated_amount)
 values('11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '11110000-1111-4111-8111-111100000001',
 '33330000-3333-4333-8333-333300000001',20);
