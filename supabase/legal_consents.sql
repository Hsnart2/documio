-- DocuMio legal consent audit trail
-- Run in Supabase SQL Editor before enabling server-side consent logging.

create table if not exists public.legal_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  privacy_version text not null,
  terms_version text not null,
  cookie_version text not null,
  accepted_at timestamptz not null default now(),
  source text not null default 'web_registration',
  locale text not null default 'it',
  user_agent text,
  special_category_consent boolean not null default false,
  special_category_consent_at timestamptz,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists legal_consents_user_id_idx
  on public.legal_consents(user_id, accepted_at desc);

alter table public.legal_consents enable row level security;

drop policy if exists "Users can read own legal consents" on public.legal_consents;
create policy "Users can read own legal consents"
on public.legal_consents
for select
to authenticated
using (auth.uid() = user_id);

-- Consent records are append-only from a trusted server route.
-- No client INSERT/UPDATE/DELETE policy is intentionally granted.

comment on table public.legal_consents is
  'Append-only evidence of legal document acceptance and optional consents.';
