-- DocuMio: studi professionali, clienti e fascicoli segregati.
-- Fase additiva: nessuna modifica ai documenti/aziende esistenti.
-- Da applicare su staging e verificare con utenti distinti prima della produzione.
begin;

create schema if not exists documio_internal;
revoke all on schema documio_internal from public, anon;
grant usage on schema documio_internal to authenticated, service_role;

create table public.professional_studios (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 160),
  studio_type text not null check (studio_type in ('commercialista','caf','legale','multiservizi')),
  created_at timestamptz not null default now(),
  unique(id,owner_user_id)
);

create table public.professional_studio_members (
  studio_id uuid not null references public.professional_studios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_email text not null,
  role text not null check (role in ('professional','collaborator','viewer')),
  joined_at timestamptz not null default now(),
  primary key(studio_id,user_id)
);

create table public.professional_clients (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.professional_studios(id) on delete cascade,
  client_type text not null check (client_type in ('persona','azienda')),
  display_name text not null check (length(trim(display_name)) between 2 and 180),
  tax_code text,
  vat_number text,
  email text,
  notes text,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(id,studio_id)
);
create index professional_clients_studio_name_idx on public.professional_clients(studio_id,display_name);

create table public.professional_cases (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.professional_studios(id) on delete cascade,
  client_id uuid not null,
  case_type text not null check (case_type in (
    'contabilita','iva','redditi','f24','730','isee','successione',
    'contratto','contenzioso','consulenza','altro')),
  title text not null check (length(trim(title)) between 3 and 200),
  description text not null default '',
  status text not null default 'aperta'
    check (status in ('aperta','in_lavorazione','da_verificare','completata','archiviata')),
  due_date date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,studio_id),
  foreign key(client_id,studio_id) references public.professional_clients(id,studio_id)
    on delete restrict
);
create index professional_cases_studio_due_idx on public.professional_cases(studio_id,due_date);
create index professional_cases_client_idx on public.professional_cases(studio_id,client_id);

create table public.professional_case_tasks (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null,
  case_id uuid not null,
  title text not null check (length(trim(title)) between 3 and 220),
  is_done boolean not null default false,
  done_at timestamptz,
  done_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key(case_id,studio_id) references public.professional_cases(id,studio_id)
    on delete cascade,
  check ((is_done and done_at is not null and done_by is not null)
      or (not is_done and done_at is null and done_by is null))
);
create index professional_case_tasks_case_idx on public.professional_case_tasks(studio_id,case_id,sort_order);

create table public.professional_studio_invites (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.professional_studios(id) on delete cascade,
  email text not null check(length(trim(email)) between 5 and 254),
  role text not null check(role in ('professional','collaborator','viewer')),
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  check(expires_at > created_at)
);
create index professional_invites_studio_idx on public.professional_studio_invites(studio_id,created_at desc);

create table public.professional_activity (
  id bigint generated always as identity primary key,
  studio_id uuid not null references public.professional_studios(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null check(action in ('INSERT','UPDATE','DELETE')),
  created_at timestamptz not null default now()
);
create index professional_activity_studio_idx on public.professional_activity(studio_id,created_at desc);

-- Il controllo dei permessi legge SEMPRE auth.uid(), mai metadata modificabili
-- dal browser. È in schema non esposto alle API REST di Supabase.
create function documio_internal.professional_role(p_studio_id uuid)
returns text language sql stable security definer set search_path=''
as $$
  select coalesce(
    (select 'owner'::text from public.professional_studios s
      where s.id=p_studio_id and s.owner_user_id=(select auth.uid())),
    (select m.role from public.professional_studio_members m
      where m.studio_id=p_studio_id and m.user_id=(select auth.uid()))
  );
$$;
revoke all on function documio_internal.professional_role(uuid) from public,anon;
grant execute on function documio_internal.professional_role(uuid) to authenticated;

-- Accettazione atomica, con email confermata: conoscere il link non basta
-- se non si è titolari della casella invitata.
create function documio_internal.accept_professional_invite(p_token_hash text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  invited public.professional_studio_invites%rowtype;
  verified_email text;
begin
  if auth.uid() is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invito non valido' using errcode='42501';
  end if;
  select lower(trim(u.email::text)) into verified_email
    from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
  if verified_email is null then
    raise exception 'Verifica prima la tua email' using errcode='42501';
  end if;
  select * into invited from public.professional_studio_invites
    where token_hash=p_token_hash and accepted_at is null
      and revoked_at is null and expires_at>now()
    for update;
  if not found or lower(trim(invited.email)) <> verified_email then
    raise exception 'Invito scaduto o non destinato a questo account'
      using errcode='42501';
  end if;
  if exists(select 1 from public.professional_studios
     where id=invited.studio_id and owner_user_id=auth.uid()) then
    raise exception 'Sei già proprietario dello studio' using errcode='42501';
  end if;
  insert into public.professional_studio_members(studio_id,user_id,member_email,role)
    values(invited.studio_id,auth.uid(),verified_email,invited.role)
    on conflict(studio_id,user_id) do nothing;
  update public.professional_studio_invites set accepted_at=now() where id=invited.id;
  return invited.studio_id;
end;
$$;
revoke all on function documio_internal.accept_professional_invite(text) from public,anon;
grant execute on function documio_internal.accept_professional_invite(text) to authenticated;

-- RPC pubblica senza privilegi elevati; l'esecuzione reale rimane interna.
create function public.documio_accept_professional_invite(p_token_hash text)
returns uuid language sql security invoker set search_path=''
as $$ select documio_internal.accept_professional_invite(p_token_hash); $$;
revoke all on function public.documio_accept_professional_invite(text) from public,anon;
grant execute on function public.documio_accept_professional_invite(text) to authenticated;

create function documio_internal.professional_guard()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  if tg_op='UPDATE' then
    if new.studio_id is distinct from old.studio_id
       or new.created_by is distinct from old.created_by
       or (tg_table_name='professional_case_tasks'
           and new.case_id is distinct from old.case_id) then
      raise exception 'Spostamento tra fascicoli o modifica autore non consentiti';
    end if;
  end if;
  if tg_table_name='professional_case_tasks' then
    if new.is_done then
      if tg_op='INSERT' or old.is_done is distinct from true then
        new.done_at:=now();
        new.done_by:=auth.uid();
      else
        new.done_at:=old.done_at;
        new.done_by:=old.done_by;
      end if;
    else
      new.done_at:=null;
      new.done_by:=null;
    end if;
  end if;
  if tg_table_name='professional_cases' then new.updated_at:=now(); end if;
  return new;
end;
$$;
revoke all on function documio_internal.professional_guard() from public,anon;
create trigger professional_client_guard before update on public.professional_clients
 for each row execute function documio_internal.professional_guard();
create trigger professional_case_guard before update on public.professional_cases
 for each row execute function documio_internal.professional_guard();
create trigger professional_task_guard before insert or update on public.professional_case_tasks
 for each row execute function documio_internal.professional_guard();

create function documio_internal.professional_audit()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.professional_activity(studio_id,actor_id,entity_type,entity_id,action)
    values(
      case when tg_op='DELETE' then old.studio_id else new.studio_id end,
      auth.uid(),tg_table_name,
      case when tg_op='DELETE' then old.id else new.id end,
      tg_op
    );
  return coalesce(new,old);
end;
$$;
revoke all on function documio_internal.professional_audit() from public,anon;
create trigger professional_clients_audit after insert or update on public.professional_clients
  for each row execute function documio_internal.professional_audit();
create trigger professional_cases_audit after insert or update on public.professional_cases
  for each row execute function documio_internal.professional_audit();
create trigger professional_tasks_audit after insert or update on public.professional_case_tasks
  for each row execute function documio_internal.professional_audit();

alter table public.professional_studios enable row level security;
alter table public.professional_studio_members enable row level security;
alter table public.professional_clients enable row level security;
alter table public.professional_cases enable row level security;
alter table public.professional_case_tasks enable row level security;
alter table public.professional_studio_invites enable row level security;
alter table public.professional_activity enable row level security;

create policy professional_studios_read on public.professional_studios
 for select to authenticated
 using (documio_internal.professional_role(id) is not null);
create policy professional_studios_insert on public.professional_studios
 for insert to authenticated with check(owner_user_id=(select auth.uid()));
create policy professional_studios_update on public.professional_studios
 for update to authenticated
 using(owner_user_id=(select auth.uid()))
 with check(owner_user_id=(select auth.uid()));

create policy professional_members_read on public.professional_studio_members
 for select to authenticated
 using(documio_internal.professional_role(studio_id) is not null);

create policy professional_clients_read on public.professional_clients
 for select to authenticated
 using(documio_internal.professional_role(studio_id) is not null);
create policy professional_clients_add on public.professional_clients
 for insert to authenticated
 with check(created_by=(select auth.uid())
    and documio_internal.professional_role(studio_id) in ('owner','professional','collaborator'));
create policy professional_clients_edit on public.professional_clients
 for update to authenticated
 using(documio_internal.professional_role(studio_id) in ('owner','professional','collaborator'))
 with check(documio_internal.professional_role(studio_id) in ('owner','professional','collaborator'));

create policy professional_cases_read on public.professional_cases
 for select to authenticated
 using(documio_internal.professional_role(studio_id) is not null);
create policy professional_cases_add on public.professional_cases
 for insert to authenticated
 with check(created_by=(select auth.uid())
   and documio_internal.professional_role(studio_id) in ('owner','professional','collaborator'));
create policy professional_cases_edit on public.professional_cases
 for update to authenticated
 using(documio_internal.professional_role(studio_id) in ('owner','professional','collaborator'))
 with check(documio_internal.professional_role(studio_id) in ('owner','professional','collaborator'));

create policy professional_tasks_read on public.professional_case_tasks
 for select to authenticated
 using(documio_internal.professional_role(studio_id) is not null);
create policy professional_tasks_add on public.professional_case_tasks
 for insert to authenticated
 with check(created_by=(select auth.uid())
   and documio_internal.professional_role(studio_id) in ('owner','professional','collaborator'));
create policy professional_tasks_edit on public.professional_case_tasks
 for update to authenticated
 using(documio_internal.professional_role(studio_id) in ('owner','professional','collaborator'))
 with check(documio_internal.professional_role(studio_id) in ('owner','professional','collaborator'));

create policy professional_invites_read on public.professional_studio_invites
 for select to authenticated
 using(documio_internal.professional_role(studio_id)='owner');
create policy professional_invites_add on public.professional_studio_invites
 for insert to authenticated
 with check(created_by=(select auth.uid())
   and documio_internal.professional_role(studio_id)='owner');
create policy professional_activity_read on public.professional_activity
 for select to authenticated
 using(documio_internal.professional_role(studio_id) is not null);

-- Nessun utente può aggiungere direttamente membership o manipolare audit.
revoke all on public.professional_studios,public.professional_studio_members,
 public.professional_clients,public.professional_cases,
 public.professional_case_tasks,public.professional_studio_invites,
 public.professional_activity from anon,authenticated;
grant select,insert,update on public.professional_studios to authenticated;
grant select on public.professional_studio_members to authenticated;
grant select,insert,update on public.professional_clients to authenticated;
grant select,insert,update on public.professional_cases to authenticated;
grant select,insert,update on public.professional_case_tasks to authenticated;
grant select,insert on public.professional_studio_invites to authenticated;
grant select on public.professional_activity to authenticated;
grant all on public.professional_studios,public.professional_studio_members,
 public.professional_clients,public.professional_cases,
 public.professional_case_tasks,public.professional_studio_invites,
 public.professional_activity to service_role;

commit;
