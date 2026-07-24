create table if not exists public.email_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail')),
  email_address text,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.email_connections enable row level security;

create policy "Users can read their own email connections"
on public.email_connections for select
using (auth.uid() = user_id);

create policy "Users can delete their own email connections"
on public.email_connections for delete
using (auth.uid() = user_id);

comment on table public.email_connections is
'Encrypted OAuth tokens for user-authorized email providers. Server-only writes use the service role.';
