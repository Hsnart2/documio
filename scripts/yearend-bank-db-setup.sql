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
insert into public.financial_companies(id,user_id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222');
insert into public.documents(id,user_id,company_id) values
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
