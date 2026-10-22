-- Overture hydration checkpoint and atomic candidate staging.
-- Deploy through an authorized Supabase migration route; do not run against
-- Production until the extraction query has passed live read-only validation.
create table if not exists public.overture_hydration_checkpoints (
  task_id uuid primary key references public.place_discovery_hydration_queue(id) on delete cascade,
  last_source_id text not null default '',
  lease_token uuid,
  lease_until timestamptz,
  batches_staged integer not null default 0,
  rows_staged bigint not null default 0,
  extraction_complete boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.overture_hydration_checkpoints enable row level security;
revoke all on public.overture_hydration_checkpoints from public, anon, authenticated;
grant select, insert, update on public.overture_hydration_checkpoints to service_role;

create or replace function public.claim_overture_hydration_task()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_task record; v_token uuid := gen_random_uuid(); v_cursor text;
begin
  select q.* into v_task
  from public.place_discovery_hydration_queue q
  left join public.overture_hydration_checkpoints c on c.task_id=q.id
  where q.source_key='overture' and not q.owner_paused
    and q.release is not null
    and (q.status='pending' or (q.status='running' and (c.lease_until is null or c.lease_until < now())))
    and coalesce(c.extraction_complete,false)=false
  order by q.priority desc,q.requested_at
  for update of q skip locked limit 1;
  if not found then return null; end if;
  insert into public.overture_hydration_checkpoints(task_id,lease_token,lease_until)
    values(v_task.id,v_token,now()+interval '20 minutes')
    on conflict(task_id) do update set lease_token=excluded.lease_token,
      lease_until=excluded.lease_until,updated_at=now()
    returning last_source_id into v_cursor;
  update public.place_discovery_hydration_queue
  set status='running',started_at=coalesce(started_at,now()),
      attempt_count=attempt_count+1,updated_at=now()
  where id=v_task.id;
  return jsonb_build_object('task_id',v_task.id,'lease_token',v_token,
    'release',v_task.release,'bbox',v_task.bbox,'market_key',v_task.market_key,
    'last_source_id',v_cursor);
end $$;
revoke all on function public.claim_overture_hydration_task() from public, anon, authenticated;
grant execute on function public.claim_overture_hydration_task() to service_role;

create or replace function public.stage_overture_hydration_page(
  p_task_id uuid,p_lease_token uuid,p_last_id text,p_rows jsonb,p_exhausted boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_checkpoint record; v_task record; v_count integer; v_result jsonb;
begin
  select * into v_checkpoint from public.overture_hydration_checkpoints
    where task_id=p_task_id for update;
  if not found or v_checkpoint.lease_token is distinct from p_lease_token
     or v_checkpoint.lease_until<=now() or v_checkpoint.extraction_complete then
    raise exception 'invalid or expired overture lease';
  end if;
  select * into v_task from public.place_discovery_hydration_queue where id=p_task_id for update;
  if not found or v_task.status<>'running' or v_task.owner_paused then
    raise exception 'overture task is not running or is paused';
  end if;
  if jsonb_typeof(p_rows)<>'array' then raise exception 'rows must be an array'; end if;
  v_count:=jsonb_array_length(p_rows);
  if v_count>500 then raise exception 'overture page too large'; end if;
  if p_last_id is null or (p_last_id collate "C") < (v_checkpoint.last_source_id collate "C") then
    raise exception 'overture cursor regressed';
  end if;
  if v_count>0 then
    if p_last_id=v_checkpoint.last_source_id then raise exception 'nonadvancing cursor'; end if;
    v_result:=public.stage_ingestion_candidate_batch(
      'overture',null,'overture:'||p_task_id::text||':'||p_last_id,p_rows);
  else
    v_result:=jsonb_build_object('staged',false,'row_count',0);
  end if;
  update public.overture_hydration_checkpoints set
    last_source_id=p_last_id,rows_staged=rows_staged+v_count,
    batches_staged=batches_staged+case when v_count>0 then 1 else 0 end,
    extraction_complete=p_exhausted,lease_token=null,lease_until=null,updated_at=now()
    where task_id=p_task_id;
  update public.place_discovery_hydration_queue set
    status=case when p_exhausted then 'completed' else 'pending' end,
    completed_at=case when p_exhausted then now() else null end,
    records_seen=records_seen+v_count,updated_at=now()
    where id=p_task_id;
  return jsonb_build_object('cursor',p_last_id,'extraction_complete',p_exhausted,
    'rows_staged',v_count,'batch',v_result);
end $$;
revoke all on function public.stage_overture_hydration_page(uuid,uuid,text,jsonb,boolean)
  from public, anon, authenticated;
grant execute on function public.stage_overture_hydration_page(uuid,uuid,text,jsonb,boolean)
  to service_role;
