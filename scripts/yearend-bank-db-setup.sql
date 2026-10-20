-- Base minima per collaudare la migrazione su PostgreSQL temporaneo CI.
create schema if not exists documio_internal;
create table public.financial_companies(
 id uuid primary key,
 user_id uuid not null references auth.users(id),
 unique(id,user_id)
);
create table public.documents(
 id uuid primary key,
 user_id uuid not null references auth.users(id),
 company_id uuid,
 unique(id,user_id)
);
alter table public.financial_companies enable row level security;
create policy financial_companies_test_own on public.financial_companies
 for select to authenticated using(user_id=(select auth.uid()));
grant select on public.financial_companies to authenticated;
alter table public.documents enable row level security;
create policy documents_test_own on public.documents
 for select to authenticated using(user_id=(select auth.uid()));
create policy documents_test_edit on public.documents
 for update to authenticated using(user_id=(select auth.uid()))
 with check(user_id=(select auth.uid()));
grant select,update on public.documents to authenticated;
insert into public.financial_companies(id,user_id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222');
insert into public.documents(id,user_id,company_id) values
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
