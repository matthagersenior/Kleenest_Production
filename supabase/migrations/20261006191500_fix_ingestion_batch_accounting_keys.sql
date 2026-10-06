-- Correct future batch accounting without replaying completed candidates.
-- Existing historical zero counters cannot be reconstructed from candidate counts.
create or replace function public.process_ingestion_candidate_batches(p_max_batches integer default 4)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare r record; v_result jsonb; v_done int:=0; v_imported int:=0; v_updated int:=0; v_failed int:=0; v_inserted int; v_changed int;
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
    v_inserted:=coalesce((v_result->>'imported_locations')::int,(v_result->>'inserted')::int,(v_result->>'imported')::int,0);
    v_changed:=coalesce((v_result->>'updated_locations')::int,(v_result->>'updated')::int,0);
    update public.ingestion_candidate_batches set status='completed',lease_until=null,completed_at=now(),
      imported_count=v_inserted,updated_count=v_changed where id=r.id;
    v_done:=v_done+1; v_imported:=v_imported+v_inserted; v_updated:=v_updated+v_changed;
   end if;
  exception when others then
   v_failed:=v_failed+1;
   update public.ingestion_candidate_batches set status=case when attempt_count>=5 then 'failed' else 'pending' end,
    available_at=now()+make_interval(secs=>least(300,15*(attempt_count+1))),lease_until=null,last_error=sqlerrm where id=r.id;
  end;
 end loop;
 return jsonb_build_object('processed_batches',v_done,'imported',v_imported,'updated',v_updated,'failed',v_failed);
end $function$;
revoke all on function public.process_ingestion_candidate_batches(integer) from public,anon,authenticated;
