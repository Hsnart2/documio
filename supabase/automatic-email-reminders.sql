create table if not exists public.email_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delivery_date date not null,
  reminder_count integer not null default 0 check (reminder_count >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, delivery_date)
);

alter table public.email_notification_deliveries enable row level security;

revoke all on table public.email_notification_deliveries from anon, authenticated;

create index if not exists email_notification_deliveries_user_date_idx
  on public.email_notification_deliveries (user_id, delivery_date desc);
