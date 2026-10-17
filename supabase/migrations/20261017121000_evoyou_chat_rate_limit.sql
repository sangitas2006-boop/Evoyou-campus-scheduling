-- Rate limiting for the public, read-only EVOYOU chat endpoint.
-- Stores hashed client identifiers and per-minute counters only; no chat text or raw IP is stored.
create table if not exists public.evoyou_chat_rate_limits (
  bucket_start timestamptz not null,
  client_hash text not null,
  request_count integer not null default 0,
  primary key (bucket_start, client_hash)
);

alter table public.evoyou_chat_rate_limits enable row level security;
revoke all on table public.evoyou_chat_rate_limits from anon, authenticated;
grant all on table public.evoyou_chat_rate_limits to service_role;

create or replace function public.check_evoyou_chat_rate_limit(p_client_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket timestamptz := date_trunc('minute', now());
  v_client_count integer;
  v_global_count integer;
begin
  if p_client_hash is null or length(p_client_hash) < 32 or length(p_client_hash) > 128 then
    return false;
  end if;

  delete from public.evoyou_chat_rate_limits
  where bucket_start < now() - interval '2 hours';

  insert into public.evoyou_chat_rate_limits (bucket_start, client_hash, request_count)
  values (v_bucket, p_client_hash, 1)
  on conflict (bucket_start, client_hash)
  do update set request_count = public.evoyou_chat_rate_limits.request_count + 1
  returning request_count into v_client_count;

  insert into public.evoyou_chat_rate_limits (bucket_start, client_hash, request_count)
  values (v_bucket, '__global__', 1)
  on conflict (bucket_start, client_hash)
  do update set request_count = public.evoyou_chat_rate_limits.request_count + 1
  returning request_count into v_global_count;

  -- 8 requests/minute per hashed client identifier; 40/minute across the project.
  return v_client_count <= 8 and v_global_count <= 40;
end;
$$;

revoke all on function public.check_evoyou_chat_rate_limit(text) from public, anon, authenticated;
grant execute on function public.check_evoyou_chat_rate_limit(text) to service_role;
