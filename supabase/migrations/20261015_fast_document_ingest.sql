-- DocuMio: archivio immediato + analisi AI differita e ripristinabile.
-- Backward compatible: i documenti precedenti restano 'completed'.
begin;

alter table public.documents
  add column if not exists ai_status text not null default 'completed',
  add column if not exists ai_user_note text,
  add column if not exists ai_analyzed_at timestamptz;

alter table public.documents drop constraint if exists documents_ai_status_check;
alter table public.documents
  add constraint documents_ai_status_check
  check (ai_status in ('queued','processing','completed','needs_review','failed'));

create index if not exists documents_ai_status_owner_idx
  on public.documents(user_id, ai_status) where ai_status in ('queued','processing','failed');

create table if not exists public.document_ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null unique references public.documents(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued','processing','completed','needs_review','failed')),
  attempts smallint not null default 0 check(attempts between 0 and 3),
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists document_ai_jobs_claim_idx
  on public.document_ai_jobs(status,next_attempt_at,created_at)
  where status in ('queued','failed','processing');

alter table public.document_ai_jobs enable row level security;
alter table public.document_ai_jobs force row level security;

drop policy if exists ai_jobs_user_select on public.document_ai_jobs;
create policy ai_jobs_user_select on public.document_ai_jobs
  for select to authenticated using (auth.uid()=user_id);

revoke all on table public.document_ai_jobs from anon, authenticated;
grant select on public.document_ai_jobs to authenticated;
grant all on table public.document_ai_jobs to service_role;

-- I lavori vengono accodati nella STESSA transazione del salvataggio della
-- scheda documento; l'utente non puo' falsificare lavori su altri account.
create or replace function public.documio_enqueue_ai_after_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ai_status = 'queued' and new.storage_path is not null then
    insert into public.document_ai_jobs(user_id,document_id,status)
    values (new.user_id,new.id,'queued')
    on conflict(document_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.documio_enqueue_ai_after_document() from public, anon, authenticated;
drop trigger if exists documio_enqueue_ai_after_document on public.documents;
create trigger documio_enqueue_ai_after_document
after insert on public.documents for each row
execute function public.documio_enqueue_ai_after_document();

-- Claim atomico: solo service_role, SKIP LOCKED, lease e massimo 3 tentativi.
-- Si usa con limitazioni tecniche Vercel: ogni chiamata elabora un file.
create or replace function public.documio_claim_ai_job(p_document_id uuid default null)
returns setof public.document_ai_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Solo il servizio puo accodare elaborazioni AI';
  end if;
  return query
  with next_job as (
    select job.id from public.document_ai_jobs as job
    join public.documents as doc on doc.id=job.document_id and doc.user_id=job.user_id
    where (p_document_id is null or job.document_id=p_document_id)
      and job.attempts < 3
      and job.next_attempt_at <= now()
      and (
        job.status in ('queued','failed')
        or (job.status='processing' and job.lease_expires_at < now())
      )
      and doc.ai_status in ('queued','processing','failed')
      and doc.storage_path is not null
    order by job.created_at asc
    limit 1
    for update of job skip locked
  )
  update public.document_ai_jobs as j
  set status='processing', attempts=j.attempts+1,
    lease_expires_at=now()+interval '120 seconds',
    updated_at=now(), last_error=null
  from next_job
  where j.id=next_job.id
  returning j.*;
end;
$$;
revoke all on function public.documio_claim_ai_job(uuid) from public, anon, authenticated;
grant execute on function public.documio_claim_ai_job(uuid) to service_role;

commit;
