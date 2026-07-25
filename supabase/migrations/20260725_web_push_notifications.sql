-- Web Push per DocuMio PWA.
-- Salva le sottoscrizioni per dispositivo e una coda di consegna senza esporre
-- il contenuto delle notifiche al servizio push del browser.

alter table public.automation_notifications
  add column if not exists push_sent_at timestamptz;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  lookup_key text not null,
  user_agent text,
  device_label text,
  enabled boolean not null default true,
  failure_count integer not null default 0,
  last_success_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint),
  unique (lookup_key)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id, enabled);

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  notification_id uuid not null references public.automation_notifications(id) on delete cascade,
  sent_at timestamptz,
  pulled_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (subscription_id, notification_id)
);

create index if not exists push_deliveries_pending_idx
  on public.push_deliveries(subscription_id, created_at)
  where sent_at is not null and pulled_at is null;

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

drop trigger if exists push_subscriptions_set_updated_at
  on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.documio_set_updated_at();

alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;

drop policy if exists "push subscriptions own rows"
  on public.push_subscriptions;
create policy "push subscriptions own rows"
on public.push_subscriptions
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "push deliveries own rows"
  on public.push_deliveries;
create policy "push deliveries own rows"
on public.push_deliveries
for select
to authenticated
using (
  exists (
    select 1
    from public.push_subscriptions subscription
    where subscription.id = push_deliveries.subscription_id
      and subscription.user_id = auth.uid()
  )
);

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete
  on public.push_subscriptions
  to authenticated;
grant select
  on public.push_deliveries
  to authenticated;
grant all privileges
  on public.push_subscriptions,
     public.push_deliveries,
     public.automation_notifications
  to service_role;
grant execute on function public.documio_set_updated_at()
  to authenticated, service_role;
