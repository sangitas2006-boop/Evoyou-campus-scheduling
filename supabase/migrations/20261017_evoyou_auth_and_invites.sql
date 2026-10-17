-- EVOYOU identity and invitation foundation
-- Apply only to the dedicated EVOYOU Supabase project in South Asia (Mumbai).
-- Does not create Auth users or send email.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin','student')),
  created_at timestamptz not null default now(),
  primary key (user_id, institution_id)
);
create index if not exists memberships_institution_role_idx
  on public.memberships (institution_id, role, user_id);

create table if not exists public.student_invitations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  code_hash text not null unique check (length(code_hash) = 64),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index if not exists student_invitations_lookup_idx
  on public.student_invitations (institution_id, email, expires_at)
  where accepted_at is null and revoked_at is null;

-- Bootstrap allow-list is private and never granted to browser roles.
create table if not exists private.bootstrap_config (
  institution_id uuid primary key references public.institutions(id) on delete cascade,
  admin_email text not null check (admin_email = lower(trim(admin_email))),
  admin_name text not null,
  used_at timestamptz
);

alter table public.institutions enable row level security;
alter table public.memberships enable row level security;
alter table public.student_invitations enable row level security;

create or replace function public.is_evoyou_member(p_institution_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid())
      and m.institution_id = p_institution_id
  );
$$;

create or replace function public.is_evoyou_admin(p_institution_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid())
      and m.institution_id = p_institution_id
      and m.role = 'admin'
  );
$$;
revoke all on function public.is_evoyou_member(uuid) from public, anon;
revoke all on function public.is_evoyou_admin(uuid) from public, anon;
grant execute on function public.is_evoyou_member(uuid) to authenticated;
grant execute on function public.is_evoyou_admin(uuid) to authenticated;

grant select on public.institutions, public.memberships to authenticated;
grant select on public.student_invitations to authenticated;
revoke insert, update, delete on public.institutions, public.memberships, public.student_invitations from public, anon, authenticated;

drop policy if exists institutions_members_read on public.institutions;
create policy institutions_members_read on public.institutions
  for select to authenticated using (public.is_evoyou_member(id));

drop policy if exists memberships_self_or_admin_read on public.memberships;
create policy memberships_self_or_admin_read on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_evoyou_admin(institution_id));

drop policy if exists student_invitations_admin_read on public.student_invitations;
create policy student_invitations_admin_read on public.student_invitations
  for select to authenticated using (public.is_evoyou_admin(institution_id));

-- One-time initial administrator: allowed only for the private allow-listed email,
-- after Supabase has verified the mailbox, and only while the institution is empty.
create or replace function public.bootstrap_first_admin(p_full_name text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  cfg private.bootstrap_config%rowtype;
  current_user_id uuid := (select auth.uid());
  current_email text;
begin
  if current_user_id is null then return false; end if;

  select lower(u.email) into current_email
  from auth.users u
  where u.id = current_user_id and u.email_confirmed_at is not null;
  if current_email is null then return false; end if;

  select * into cfg
  from private.bootstrap_config
  where admin_email = current_email
  for update;
  if not found or cfg.used_at is not null then return false; end if;

  if exists (select 1 from public.memberships m where m.institution_id = cfg.institution_id) then
    return false;
  end if;

  insert into public.memberships (user_id, institution_id, full_name, role)
  values (
    current_user_id,
    cfg.institution_id,
    coalesce(nullif(left(trim(p_full_name), 120), ''), cfg.admin_name),
    'admin'
  );

  update private.bootstrap_config set used_at = now()
  where institution_id = cfg.institution_id and used_at is null;
  return found;
end;
$$;
revoke all on function public.bootstrap_first_admin(text) from public, anon;
grant execute on function public.bootstrap_first_admin(text) to authenticated;

-- Create a high-entropy, one-time invite hash for an administrator's institution.
-- The client generates the raw code; only its SHA-256 hash is stored.
create or replace function public.issue_student_invitation(
  p_email text,
  p_code_hash text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  admin_institution uuid;
  new_id uuid;
  normalized_email text := lower(trim(p_email));
begin
  select m.institution_id into admin_institution
  from public.memberships m
  where m.user_id = (select auth.uid()) and m.role = 'admin'
  order by m.created_at limit 1;
  if admin_institution is null then raise exception 'Administrator access required'; end if;
  if normalized_email = '' or length(p_code_hash) <> 64
     or p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    raise exception 'Invalid invitation details';
  end if;
  if exists (
    select 1 from auth.users u
    join public.memberships m on m.user_id = u.id
    where m.institution_id = admin_institution and lower(u.email) = normalized_email
  ) then raise exception 'This email already has campus access'; end if;
  if exists (
    select 1 from public.student_invitations i
    where i.institution_id = admin_institution and i.email = normalized_email
      and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  ) then raise exception 'An active invitation already exists for this email'; end if;
  insert into public.student_invitations
    (institution_id,email,code_hash,expires_at,created_by)
  values
    (admin_institution,normalized_email,lower(p_code_hash),p_expires_at,(select auth.uid()))
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.issue_student_invitation(text,text,timestamptz) from public, anon;
grant execute on function public.issue_student_invitation(text,text,timestamptz) to authenticated;

-- The public invitation form receives only a true/false result; it cannot read
-- invitation rows, tenant IDs, inviter identities or other student invitations.
create or replace function public.validate_student_invitation(p_email text,p_code_hash text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_invitations i
    where i.email = lower(trim(p_email)) and i.code_hash = lower(p_code_hash)
      and i.expires_at > now() and i.claimed_at is null
      and i.accepted_at is null and i.revoked_at is null
  );
$$;
revoke all on function public.validate_student_invitation(text,text) from public, authenticated;
grant execute on function public.validate_student_invitation(text,text) to anon;

-- Claim an email-bound code atomically before creating the Auth account.
create or replace function public.claim_student_invitation(p_email text,p_code_hash text)
returns table (invitation_id uuid)
language sql security definer
set search_path = ''
as $$
  update public.student_invitations i
  set claimed_at = now()
  where i.email = lower(trim(p_email)) and i.code_hash = lower(p_code_hash)
    and i.expires_at > now() and i.claimed_at is null
    and i.accepted_at is null and i.revoked_at is null
  returning i.id;
$$;
revoke all on function public.claim_student_invitation(text,text) from public, anon, authenticated;
grant execute on function public.claim_student_invitation(text,text) to service_role;

-- If Auth failed before creating an account, release the claim so the invited
-- student can retry. Do not release when an Auth user already exists.
create or replace function public.release_student_invitation_claim(p_invitation_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare changed integer;
begin
  update public.student_invitations i
  set claimed_at = null
  where i.id = p_invitation_id and i.accepted_at is null and i.revoked_at is null
    and i.claimed_at > now() - interval '10 minutes'
    and not exists (select 1 from auth.users u where lower(u.email) = i.email);
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.release_student_invitation_claim(uuid) from public, anon, authenticated;
grant execute on function public.release_student_invitation_claim(uuid) to service_role;


-- Complete a student join only for a verified Auth email that matches the
-- unexpired, unused code hash carried in user metadata. No role comes from metadata.
create or replace function public.complete_student_invitation(p_full_name text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text;
  invite_hash text;
  inv public.student_invitations%rowtype;
begin
  if current_user_id is null then return false; end if;
  select lower(u.email), u.raw_user_meta_data ->> 'evoyou_invite_hash'
    into current_email, invite_hash
  from auth.users u
  where u.id = current_user_id and u.email_confirmed_at is not null;
  if current_email is null or invite_hash is null then return false; end if;

  select * into inv
  from public.student_invitations i
  where i.email = current_email and i.code_hash = lower(invite_hash)
    and i.expires_at > now() and i.accepted_at is null and i.revoked_at is null
  for update;
  if not found then return false; end if;

  insert into public.memberships (user_id,institution_id,full_name,role)
  values (current_user_id,inv.institution_id,left(trim(p_full_name),120),'student')
  on conflict (user_id,institution_id) do nothing;
  if not found then return false; end if;

  update public.student_invitations set accepted_at = now()
  where id = inv.id and accepted_at is null and revoked_at is null;
  return found;
end;
$$;
revoke all on function public.complete_student_invitation(text) from public, anon;
grant execute on function public.complete_student_invitation(text) to authenticated;

create or replace function public.revoke_student_invitation(p_invitation_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.student_invitations i
  set revoked_at = now()
  where i.id = p_invitation_id and i.accepted_at is null and i.revoked_at is null
    and public.is_evoyou_admin(i.institution_id);
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.revoke_student_invitation(uuid) from public, anon;
grant execute on function public.revoke_student_invitation(uuid) to authenticated;

comment on table public.institutions is 'EVOYOU campus tenants; tenant-facing queries must be institution-scoped.';
comment on table public.memberships is 'Authoritative institution role mapping; user-editable Auth metadata never grants roles.';
comment on table public.student_invitations is 'One-time email-bound invitations; only SHA-256 hashes of high-entropy codes are stored.';
