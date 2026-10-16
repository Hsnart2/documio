-- Schema Owner di DocuMio.
-- Applicato su Supabase il 16-10-2026; questo file conserva le definizioni
-- necessarie per riprodurre la migrazione su nuovi ambienti.

create table if not exists public.documio_owner_activity_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'UTC')::date,
  last_seen_at timestamptz not null default now(),
  primary key (user_id,day)
);
create index if not exists documio_owner_activity_day_idx on public.documio_owner_activity_daily(day);
alter table public.documio_owner_activity_daily enable row level security;
revoke all on table public.documio_owner_activity_daily from anon,authenticated;
grant select,insert,update,delete on table public.documio_owner_activity_daily to service_role;

create table if not exists public.documio_owner_api_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid null references public.financial_companies(id) on delete set null,
  provider text not null check(provider in ('openai','ilovepdf','gocardless','resend','other')),
  feature text not null check(char_length(feature) between 1 and 80),
  model text null,
  status text not null check(status in ('success','error')),
  input_tokens integer not null default 0 check(input_tokens>=0),
  output_tokens integer not null default 0 check(output_tokens>=0),
  cached_input_tokens integer not null default 0 check(cached_input_tokens>=0),
  created_at timestamptz not null default now()
);
create index if not exists documio_owner_usage_when_idx on public.documio_owner_api_usage(created_at desc);
create index if not exists documio_owner_usage_user_when_idx on public.documio_owner_api_usage(user_id,created_at desc);
alter table public.documio_owner_api_usage enable row level security;
revoke all on table public.documio_owner_api_usage from anon,authenticated;
grant select,insert,update,delete on table public.documio_owner_api_usage to service_role;

CREATE OR REPLACE FUNCTION public.documio_owner_overview(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  span_days integer := greatest(1,least(90,coalesce(p_days,30)));
  today_utc date := (now() at time zone 'UTC')::date;
  start_day date;
  payload jsonb;
begin
  -- Controllo server-side: non è sufficiente conoscere l'email o indovinare l'URL.
  if auth.uid() is null or not exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(u.email::text) = 'nextmindsoftware@gmail.com'
      and u.email_confirmed_at is not null
  ) then
    raise exception 'Accesso Owner non autorizzato' using errcode = '42501';
  end if;

  start_day := today_utc - (span_days - 1);

  with customers as (
    select
      u.id,
      u.email::text as email,
      u.created_at,
      u.last_sign_in_at,
      (select count(*) from public.documents d where d.user_id=u.id)::integer as documents,
      (select count(*) from public.documents d where d.user_id=u.id
        and d.uploaded_at>=start_day::timestamptz)::integer as documents_period,
      (select coalesce(sum(greatest(coalesce(d.size,0),0)),0) from public.documents d
        where d.user_id=u.id)::bigint as document_bytes,
      (select count(*) from public.financial_invoices i where i.user_id=u.id)::integer as invoices,
      (select count(*) from public.financial_companies c where c.user_id=u.id)::integer as companies,
      (select count(*) from public.documio_owner_activity_daily a
        where a.user_id=u.id and a.day>=start_day)::integer as active_days,
      (select max(a.last_seen_at) from public.documio_owner_activity_daily a
        where a.user_id=u.id) as last_activity,
      (select count(*) from public.documio_owner_api_usage e
        where e.user_id=u.id and e.created_at>=start_day::timestamptz)::integer as api_calls,
      (select count(*) from public.documio_owner_api_usage e
        where e.user_id=u.id and e.created_at>=start_day::timestamptz
          and e.status='error')::integer as api_errors,
      (select coalesce(sum(e.input_tokens),0) from public.documio_owner_api_usage e
        where e.user_id=u.id and e.created_at>=start_day::timestamptz)::bigint as input_tokens,
      (select coalesce(sum(e.output_tokens),0) from public.documio_owner_api_usage e
        where e.user_id=u.id and e.created_at>=start_day::timestamptz)::bigint as output_tokens,
      (select count(*) from public.email_connections ec where ec.user_id=u.id)::integer as email_connections,
      (select count(*) from public.financial_bank_connections bc where bc.user_id=u.id)::integer as bank_connections
    from auth.users u
  ),
  by_company as (
    select c.id,c.user_id,c.legal_name,
      (select count(*) from public.documents d where d.company_id=c.id)::integer as documents,
      (select coalesce(sum(greatest(coalesce(d.size,0),0)),0)
        from public.documents d where d.company_id=c.id)::bigint as document_bytes,
      (select count(*) from public.financial_invoices i where i.company_id=c.id)::integer as invoices,
      (select count(*) from public.documio_owner_api_usage e
        where e.company_id=c.id and e.created_at>=start_day::timestamptz)::integer as api_calls
    from public.financial_companies c
  ),
  by_day as (
    select series.day::date as day,
      (select count(*) from public.documio_owner_activity_daily a
        where a.day=series.day::date)::integer as active,
      (select count(*) from public.documents d
        where d.uploaded_at>=series.day and d.uploaded_at<series.day+interval '1 day')::integer as uploads,
      (select count(*) from public.financial_invoices i
        where i.created_at>=series.day and i.created_at<series.day+interval '1 day')::integer as invoices,
      (select count(*) from public.documio_owner_api_usage e
        where e.created_at>=series.day and e.created_at<series.day+interval '1 day')::integer as api_calls
    from generate_series(start_day::timestamp,today_utc::timestamp,interval '1 day') as series(day)
  ),
  by_provider as (
    select e.provider,e.feature,count(*)::integer as calls,
      count(*) filter (where e.status='error')::integer as errors,
      coalesce(sum(e.input_tokens),0)::bigint as input_tokens,
      coalesce(sum(e.output_tokens),0)::bigint as output_tokens,
      coalesce(sum(e.cached_input_tokens),0)::bigint as cached_input_tokens
    from public.documio_owner_api_usage e
    where e.created_at>=start_day::timestamptz
    group by e.provider,e.feature
  )
  select jsonb_build_object(
    'periodDays',span_days,
    'generatedAt',now(),
    'activityRecordedSince','2026-10-16',
    'customers',coalesce((select jsonb_agg(to_jsonb(c) order by c.last_sign_in_at desc nulls last,c.created_at desc)
      from customers c),'[]'::jsonb),
    'companies',coalesce((select jsonb_agg(to_jsonb(c) order by c.legal_name)
      from by_company c),'[]'::jsonb),
    'daily',coalesce((select jsonb_agg(to_jsonb(d) order by d.day)
      from by_day d),'[]'::jsonb),
    'providerUsage',coalesce((select jsonb_agg(to_jsonb(p) order by p.calls desc,p.provider)
      from by_provider p),'[]'::jsonb),
    'totals',jsonb_build_object(
      'registered',(select count(*) from auth.users),
      'signedInPeriod',(select count(*) from auth.users
        where last_sign_in_at>=start_day::timestamptz),
      'trackedToday',(select count(distinct a.user_id) from public.documio_owner_activity_daily a where a.day=today_utc),
      'trackedPeriod',(select count(distinct a.user_id) from public.documio_owner_activity_daily a where a.day>=start_day),
      'documents',(select count(*) from public.documents),
      'uploadedPeriod',(select count(*) from public.documents d where d.uploaded_at>=start_day::timestamptz),
      'documentBytes',(select coalesce(sum(greatest(coalesce(d.size,0),0)),0) from public.documents d),
      'invoices',(select count(*) from public.financial_invoices),
      'companies',(select count(*) from public.financial_companies),
      'apiCalls',(select count(*) from public.documio_owner_api_usage e where e.created_at>=start_day::timestamptz),
      'apiErrors',(select count(*) from public.documio_owner_api_usage e
        where e.created_at>=start_day::timestamptz and e.status='error'),
      'inputTokens',(select coalesce(sum(e.input_tokens),0) from public.documio_owner_api_usage e
        where e.created_at>=start_day::timestamptz),
      'outputTokens',(select coalesce(sum(e.output_tokens),0) from public.documio_owner_api_usage e
        where e.created_at>=start_day::timestamptz),
      'aiQueued',(select count(*) from public.document_ai_jobs j
        where j.status in ('queued','processing','failed')),
      'emailConnections',(select count(*) from public.email_connections),
      'bankConnections',(select count(*) from public.financial_bank_connections)
    )
  ) into payload;

  return payload;
end
$function$
;

revoke all on function public.documio_owner_overview(integer) from public,anon;
grant execute on function public.documio_owner_overview(integer) to authenticated;
