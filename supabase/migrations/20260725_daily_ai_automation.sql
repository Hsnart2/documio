-- Fase 4: automazione giornaliera, registro IA e notifiche.

create table if not exists public.automation_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ui_mode text not null default 'advanced' check (ui_mode in ('advanced', 'standard')),
  daily_email_enabled boolean not null default true,
  trash_promotions_enabled boolean not null default true,
  import_documents_enabled boolean not null default true,
  email_digest_enabled boolean not null default true,
  timezone text not null default 'Europe/Rome',
  last_run_at timestamptz,
  last_run_status text,
  last_run_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid,
  action_type text not null,
  title text not null,
  detail text,
  status text not null default 'completed' check (status in ('completed', 'skipped', 'warning', 'failed')),
  entity_type text,
  entity_id text,
  recoverable boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists automation_activity_user_created_idx
  on public.automation_activity(user_id, created_at desc);
create index if not exists automation_activity_run_idx
  on public.automation_activity(run_id);

create table if not exists public.automation_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'urgent')),
  title text not null,
  body text not null,
  document_id uuid references public.documents(id) on delete cascade,
  activity_id uuid references public.automation_activity(id) on delete set null,
  dedupe_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists automation_notifications_user_created_idx
  on public.automation_notifications(user_id, created_at desc);
create index if not exists automation_notifications_unread_idx
  on public.automation_notifications(user_id, read_at)
  where read_at is null;

create or replace function public.documio_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists automation_preferences_set_updated_at on public.automation_preferences;
create trigger automation_preferences_set_updated_at
before update on public.automation_preferences
for each row execute function public.documio_set_updated_at();

alter table public.automation_preferences enable row level security;
alter table public.automation_activity enable row level security;
alter table public.automation_notifications enable row level security;

drop policy if exists "automation preferences own row" on public.automation_preferences;
create policy "automation preferences own row"
on public.automation_preferences
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "automation activity own rows" on public.automation_activity;
create policy "automation activity own rows"
on public.automation_activity
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "automation activity mark own rows read" on public.automation_activity;
create policy "automation activity mark own rows read"
on public.automation_activity
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "automation notifications own rows" on public.automation_notifications;
create policy "automation notifications own rows"
on public.automation_notifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "automation notifications update own rows" on public.automation_notifications;
create policy "automation notifications update own rows"
on public.automation_notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "automation notifications delete own rows" on public.automation_notifications;
create policy "automation notifications delete own rows"
on public.automation_notifications
for delete
to authenticated
using (auth.uid() = user_id);

grant usage on schema public to authenticated, service_role;

grant select, insert, update on public.automation_preferences to authenticated;
grant select, update on public.automation_activity to authenticated;
grant select, update, delete on public.automation_notifications to authenticated;

grant all privileges
on table public.automation_preferences,
         public.automation_activity,
         public.automation_notifications
to service_role;

grant execute on function public.documio_set_updated_at()
to authenticated, service_role;
