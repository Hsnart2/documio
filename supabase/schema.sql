-- Schema previsto per la seconda fase, quando collegheremo Supabase.
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null default 'Altro',
  file_name text not null,
  storage_path text,
  summary text,
  keywords text[] default '{}',
  expiry_date date,
  created_at timestamptz not null default now()
);

alter table public.documents enable row level security;
create policy "Users see own documents" on public.documents for select using (auth.uid() = user_id);
create policy "Users insert own documents" on public.documents for insert with check (auth.uid() = user_id);
create policy "Users update own documents" on public.documents for update using (auth.uid() = user_id);
create policy "Users delete own documents" on public.documents for delete using (auth.uid() = user_id);
