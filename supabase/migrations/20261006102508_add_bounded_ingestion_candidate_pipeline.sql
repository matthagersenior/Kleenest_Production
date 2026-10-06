create table if not exists public.ingestion_candidate_batches(
 id uuid primary key default extensions.uuid_generate_v4(),
 source_key text not null,
 market_id uuid references public.national_ingestion_markets(id) on delete set null,
 tile_key text,
 rows jsonb not null check(jsonb_typeof(rows)='array'),
 row_count integer not null check(row_count>=0),
 status text not null default 'pending' check(status in ('pending','processing','completed','failed')),
 attempt_count integer not null default 0,
 available_at timestamptz not null default now(),
 lease_until timestamptz,
 last_error text,
 imported_count integer not null default 0,
 updated_count integer not null default 0,
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
create index if not exists ingestion_candidate_batches_ready_idx on public.ingestion_candidate_batches(status,available_at,created_at);
alter table public.ingestion_candidate_batches enable row level security;
revoke all on public.ingestion_candidate_batches from anon,authenticated;

create or replace function public.stage_ingestion_candidate_batch(p_source_key text,p_market_id uuid,p_tile_key text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_count int;
begin
 if jsonb_typeof(p_rows)<>'array' then raise exception 'rows must be array'; end if;
 v_count:=jsonb_array_length(p_rows);
 if v_count=0 then return jsonb_build_object('staged',false,'row_count',0); end if;
 if v_count>500 then raise exception 'batch exceeds 500 rows'; end if;
 insert into public.ingestion_candidate_batches(source_key,market_id,tile_key,rows,row_count)
 values(p_source_key,p_market_id,p_tile_key,p_rows,v_count) returning id into v_id;
 return jsonb_build_object('staged',true,'batch_id',v_id,'row_count',v_count);
end $$;
revoke all on function public.stage_ingestion_candidate_batch(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.stage_ingestion_candidate_batch(text,uuid,text,jsonb) to service_role;

create or replace function public.process_ingestion_candidate_batches(p_max_batches integer default 4)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; v_result jsonb; v_done int:=0; v_imported int:=0; v_updated int:=0; v_failed int:=0;
begin
 if not pg_catalog.pg_try_advisory_xact_lock(812733,2) then return jsonb_build_object('deferred',true,'reason','canonicalizer_busy'); end if;
 for r in select * from public.ingestion_candidate_batches where status='pending' and available_at<=now() order by created_at for update skip locked limit least(greatest(p_max_batches,1),16)
 loop
  update public.ingestion_candidate_batches set status='processing',lease_until=now()+interval '2 minutes',attempt_count=attempt_count+1 where id=r.id;
  begin
   v_result:=public.ingest_external_locations_background(r.source_key,r.rows);
   if coalesce((v_result->>'deferred')::boolean,false) then
    update public.ingestion_candidate_batches set status='pending',available_at=now()+interval '15 seconds',lease_until=null where id=r.id;
   else
    update public.ingestion_candidate_batches set status='completed',lease_until=null,completed_at=now(),
      imported_count=coalesce((v_result->>'inserted')::int,(v_result->>'imported')::int,0),
      updated_count=coalesce((v_result->>'updated')::int,0) where id=r.id;
    v_done:=v_done+1; v_imported:=v_imported+coalesce((v_result->>'inserted')::int,(v_result->>'imported')::int,0); v_updated:=v_updated+coalesce((v_result->>'updated')::int,0);
   end if;
  exception when others then
   v_failed:=v_failed+1;
   update public.ingestion_candidate_batches set status=case when attempt_count>=5 then 'failed' else 'pending' end,
    available_at=now()+make_interval(secs=>least(300,15*(attempt_count+1))),lease_until=null,last_error=sqlerrm where id=r.id;
  end;
 end loop;
 return jsonb_build_object('processed_batches',v_done,'imported',v_imported,'updated',v_updated,'failed',v_failed);
end $$;
revoke all on function public.process_ingestion_candidate_batches(integer) from public,anon,authenticated;
grant execute on function public.process_ingestion_candidate_batches(integer) to service_role;

create or replace function public.ingestion_pipeline_status()
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object(
 'pending_batches',count(*) filter(where status='pending'),
 'pending_rows',coalesce(sum(row_count) filter(where status='pending'),0),
 'processing_batches',count(*) filter(where status='processing'),
 'failed_batches',count(*) filter(where status='failed'),
 'completed_1h',count(*) filter(where status='completed' and completed_at>=now()-interval '1 hour'),
 'imported_1h',coalesce(sum(imported_count) filter(where completed_at>=now()-interval '1 hour'),0),
 'updated_1h',coalesce(sum(updated_count) filter(where completed_at>=now()-interval '1 hour'),0),
 'oldest_pending_at',min(created_at) filter(where status='pending'))
 from public.ingestion_candidate_batches
$$;
revoke all on function public.ingestion_pipeline_status() from public,anon;
grant execute on function public.ingestion_pipeline_status() to authenticated,service_role;
