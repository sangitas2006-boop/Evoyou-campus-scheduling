-- Shared schedule storage for authenticated EVOYOU campus members.
-- Students can read their institution's sessions; only its admin can mutate them.
create table if not exists public.campus_sessions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  course text not null check (length(trim(course)) between 1 and 120),
  teacher text not null check (length(trim(teacher)) between 1 and 120),
  room text not null check (length(trim(room)) between 1 and 80),
  cohort text not null check (length(trim(cohort)) between 1 and 80),
  student_count integer not null check (student_count between 0 and 10000),
  room_capacity integer not null check (room_capacity between 1 and 10000),
  day text not null check (day in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  start_time time not null,
  end_time time not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_sessions_valid_interval check (end_time > start_time),
  constraint campus_sessions_capacity_check check (student_count <= room_capacity)
);

create index if not exists campus_sessions_institution_day_idx
  on public.campus_sessions (institution_id, day, start_time);

alter table public.campus_sessions enable row level security;
revoke all on public.campus_sessions from public, anon;
grant select, insert, update, delete on public.campus_sessions to authenticated;

drop policy if exists campus_sessions_member_read on public.campus_sessions;
create policy campus_sessions_member_read on public.campus_sessions
  for select to authenticated using (public.is_evoyou_member(institution_id));

drop policy if exists campus_sessions_admin_insert on public.campus_sessions;
create policy campus_sessions_admin_insert on public.campus_sessions
  for insert to authenticated with check (
    public.is_evoyou_admin(institution_id) and created_by = (select auth.uid())
  );

drop policy if exists campus_sessions_admin_update on public.campus_sessions;
create policy campus_sessions_admin_update on public.campus_sessions
  for update to authenticated using (public.is_evoyou_admin(institution_id))
  with check (public.is_evoyou_admin(institution_id));

drop policy if exists campus_sessions_admin_delete on public.campus_sessions;
create policy campus_sessions_admin_delete on public.campus_sessions
  for delete to authenticated using (public.is_evoyou_admin(institution_id));

create or replace function public.enforce_campus_session_no_overlap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Serialize edits within one institution so simultaneous admin requests cannot race past this check.
  perform pg_advisory_xact_lock(hashtextextended(new.institution_id::text, 0));
  if exists (
    select 1 from public.campus_sessions s
    where s.institution_id = new.institution_id
      and s.day = new.day
      and s.id is distinct from new.id
      and s.start_time < new.end_time
      and s.end_time > new.start_time
      and (lower(s.teacher) = lower(new.teacher)
        or lower(s.room) = lower(new.room)
        or lower(s.cohort) = lower(new.cohort))
  ) then
    raise exception 'This session overlaps a teacher, room, or cohort assignment.' using errcode = '23P01';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_campus_session_no_overlap() from public, anon, authenticated;
drop trigger if exists campus_sessions_no_overlap on public.campus_sessions;
create trigger campus_sessions_no_overlap
  before insert or update on public.campus_sessions
  for each row execute function public.enforce_campus_session_no_overlap();

comment on table public.campus_sessions is 'Institution-scoped shared timetable. Student memberships can read; institution admins can write.';
