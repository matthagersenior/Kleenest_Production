-- Keep Free-plan database quota accounting separate from physical disk/WAL.
alter table public.national_ingestion_storage_guard
  add column if not exists disk_allocation_bytes bigint not null default 1073741824;
update public.national_ingestion_storage_guard
set disk_allocation_bytes=1073741824,updated_at=now()
where singleton=true and disk_allocation_bytes is distinct from 1073741824;

create or replace function public.national_ingestion_storage_status()
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 g public.national_ingestion_storage_guard%rowtype; db_bytes bigint; wal_bytes bigint; disk_observed_bytes bigint;
 database_fraction numeric; disk_fraction numeric; disk_pause_fraction numeric:=0.90; disk_hard_stop_fraction numeric:=0.95;
 auto_pause boolean; hard_stop boolean; pause_reason_text text;
begin
 if session_user<>'postgres' and coalesce(auth.jwt()->>'role','')<>'service_role' and not coalesce(public.is_platform_owner(auth.uid()),false)
 then raise exception 'Platform owner or service role required' using errcode='42501'; end if;
 select * into g from public.national_ingestion_storage_guard where singleton=true;
 select pg_database_size(current_database()) into db_bytes;
 begin select coalesce(sum(size),0)::bigint into wal_bytes from pg_ls_waldir(); exception when others then wal_bytes:=0; end;
 disk_observed_bytes:=coalesce(db_bytes,0)+coalesce(wal_bytes,0);
 database_fraction:=case when g.allocation_bytes>0 then db_bytes::numeric/g.allocation_bytes else 1 end;
 disk_fraction:=case when g.disk_allocation_bytes>0 then disk_observed_bytes::numeric/g.disk_allocation_bytes else 1 end;
 hard_stop:=database_fraction>=g.hard_stop_fraction or disk_fraction>=disk_hard_stop_fraction;
 auto_pause:=(database_fraction>=g.pause_fraction or disk_fraction>=disk_pause_fraction) and not g.resume_authorized;
 pause_reason_text:=case
  when database_fraction>=g.hard_stop_fraction then 'free_plan_database_hard_stop_85_percent'
  when disk_fraction>=disk_hard_stop_fraction then 'disk_observed_hard_stop_95_percent'
  when database_fraction>=g.pause_fraction then 'free_plan_database_pause_70_percent'
  when disk_fraction>=disk_pause_fraction then 'disk_observed_pause_90_percent' else null end;
 if hard_stop then
  update public.national_ingestion_storage_guard set paused=true,pause_reason=pause_reason_text,paused_at=coalesce(paused_at,now()),
   resume_authorized=false,resume_authorized_at=null,updated_at=now() where singleton=true;
 elsif auto_pause then
  update public.national_ingestion_storage_guard set paused=true,pause_reason=pause_reason_text,paused_at=coalesce(paused_at,now()),updated_at=now() where singleton=true;
 elsif g.resume_authorized and g.paused and not hard_stop then
  update public.national_ingestion_storage_guard set paused=false,pause_reason=null,paused_at=null,updated_at=now() where singleton=true;
 end if;
 select * into g from public.national_ingestion_storage_guard where singleton=true;
 return jsonb_build_object(
  'quota_basis','free_plan_database_quota_plus_physical_disk_guard','allocation_bytes',g.allocation_bytes,
  'database_allocation_bytes',g.allocation_bytes,'disk_allocation_bytes',g.disk_allocation_bytes,
  'pause_fraction',g.pause_fraction,'hard_stop_fraction',g.hard_stop_fraction,
  'disk_pause_fraction',disk_pause_fraction,'disk_hard_stop_fraction',disk_hard_stop_fraction,
  'database_bytes',db_bytes,'database_fraction',round(database_fraction,4),'database_percent',round(database_fraction*100,2),
  'wal_bytes',wal_bytes,'disk_observed_bytes',disk_observed_bytes,'disk_observed_fraction',round(disk_fraction,4),
  'disk_observed_percent',round(disk_fraction*100,2),'observed_bytes',db_bytes,'observed_fraction',round(database_fraction,4),
  'observed_percent',round(database_fraction*100,2),'paused',g.paused,'pause_reason',g.pause_reason,'paused_at',g.paused_at,
  'resume_authorized',g.resume_authorized,'resume_authorized_at',g.resume_authorized_at,'hard_stop',hard_stop,
  'may_ingest',not g.paused and not hard_stop);
end $function$;
revoke all on function public.national_ingestion_storage_status() from public,anon;
grant execute on function public.national_ingestion_storage_status() to authenticated,service_role;

-- Preserve the public read contract but store only dynamic/evidenced bathroom rows.
do $$
begin
 if to_regclass('public.location_bathroom_intelligence_sparse') is null
    and exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relname='location_bathroom_intelligence' and c.relkind='r')
 then alter table public.location_bathroom_intelligence rename to location_bathroom_intelligence_sparse; end if;
end $$;

create or replace view public.location_bathroom_intelligence with (security_invoker=true) as
select s.location_id,s.status,s.access,s.confidence,s.evidence_count,s.explicit_positive,s.explicit_negative,
       s.category_prior,s.source_score,s.freshness_score,s.computed_at,s.updated_at
from public.location_bathroom_intelligence_sparse s
union all
select l.id,
 case when lower(coalesce(l.place_type,'')) in ('restaurant','gas_station','cafe','shopping','service','health','library','restroom','hotel','bar','fast_food') then 'likely'
      when lower(coalesce(l.place_type,'')) in ('park','dog_park','public_safety','transit','travel') then 'uncertain' else 'unknown' end,
 'unknown',
 case when lower(coalesce(l.place_type,'')) in ('restaurant','gas_station','cafe','shopping','service','health','library','restroom','hotel','bar','fast_food') then 37.5
      when lower(coalesce(l.place_type,'')) in ('park','dog_park','public_safety','transit','travel') then 25 else 12.5 end::numeric,
 0,false,false,
 case when lower(coalesce(l.place_type,'')) in ('restaurant','gas_station','cafe','shopping','service','health','library','restroom','hotel','bar','fast_food') then 75
      when lower(coalesce(l.place_type,'')) in ('park','dog_park','public_safety','transit','travel') then 50 else 25 end::numeric,
 0::numeric,0::numeric,coalesce(l.updated_at,l.created_at,now()),coalesce(l.updated_at,l.created_at,now())
from public.locations l
where not exists(select 1 from public.location_bathroom_intelligence_sparse s where s.location_id=l.id);
revoke all on public.location_bathroom_intelligence from public,anon,authenticated;
grant select on public.location_bathroom_intelligence to service_role;

create or replace function public.compute_bathroom_intelligence(p_location_id uuid)
returns public.location_bathroom_intelligence_sparse
language plpgsql security definer set search_path='' as $function$
declare
 v_category text;v_positive int:=0;v_negative int:=0;v_customers int:=0;v_permissive int:=0;v_public int:=0;
 v_community_pos int:=0;v_community_neg int:=0;v_evidence int:=0;v_pos boolean:=false;v_neg boolean:=false;
 v_access text:='unknown';v_status text:='unknown';v_prior numeric:=0;v_source numeric:=0;v_conf numeric:=0;
 v_age_days numeric:=9999;v_community_fresh numeric:=0;v_service_fresh numeric:=0;v_fresh numeric:=0;
 v_service_kind text;v_service_at timestamptz;v_row public.location_bathroom_intelligence_sparse;
begin
 select lower(coalesce(place_type,'')) into v_category from public.locations where id=p_location_id;
 select coalesce(toilets_positive,0),coalesce(toilets_negative,0),coalesce(toilets_access_customers,0),
        coalesce(toilets_access_permissive,0),coalesce(toilets_access_public,0)
 into v_positive,v_negative,v_customers,v_permissive,v_public
 from public.external_observation_live_summary where location_id=p_location_id;
 select count(*) filter(where observation_type in('clean','supplies_ok','open','accessible','changing_table','bathroom_present')),
        count(*) filter(where observation_type in('dirty','supplies_low','closed','not_accessible','no_changing_table','bathroom_missing')),
        coalesce(extract(epoch from(now()-max(created_at)))/86400,9999)
 into v_community_pos,v_community_neg,v_age_days from public.restroom_observations where location_id=p_location_id;
 select event_kind,reported_at into v_service_kind,v_service_at from public.business_restroom_service_updates
 where location_id=p_location_id order by reported_at desc limit 1;
 v_evidence:=coalesce(v_positive,0)+coalesce(v_negative,0)+coalesce(v_customers,0)+coalesce(v_permissive,0)+coalesce(v_public,0)+v_community_pos+v_community_neg;
 v_pos:=v_evidence>0 and coalesce(v_positive,0)+coalesce(v_customers,0)+coalesce(v_permissive,0)+coalesce(v_public,0)+v_community_pos>0;
 v_neg:=coalesce(v_negative,0)+v_community_neg>0;
 v_prior:=case when v_category in('restaurant','gas_station','cafe','shopping','service','health','library','restroom','hotel','bar','fast_food') then 75
               when v_category in('park','dog_park','public_safety','transit','travel') then 50 else 25 end;
 v_source:=least(100,v_evidence*12.5);v_community_fresh:=greatest(0,least(100,100-(v_age_days*3.333333)));
 if v_service_at is not null then v_service_fresh:=public.kleenest_service_freshness_score(v_service_kind,v_service_at);end if;
 v_fresh:=greatest(v_community_fresh,v_service_fresh);
 if v_pos and v_neg then v_status:='uncertain';elsif v_pos then v_status:='confirmed';elsif v_neg then v_status:='no_bathroom';
 elsif v_prior>=75 then v_status:='likely';elsif v_prior>=50 then v_status:='uncertain';end if;
 if coalesce(v_customers,0)>0 then v_access:='customers';elsif coalesce(v_public,0)>0 then v_access:='public';
 elsif coalesce(v_permissive,0)>0 then v_access:='permissive';elsif v_neg and not v_pos then v_access:='none';end if;
 v_conf:=case when v_pos and v_neg then 60 when v_pos then least(99,80+v_source*.19) when v_neg then 95
              when v_prior>=75 then v_prior else greatest(20,v_prior) end;
 v_conf:=greatest(0,least(99,v_conf*(0.5+0.5*v_community_fresh/100)));
 if v_evidence=0 and v_fresh=0 and not v_pos and not v_neg then
  delete from public.location_bathroom_intelligence_sparse where location_id=p_location_id;
  select p_location_id,v_status,v_access,v_conf,0,false,false,v_prior,0,0,now(),now() into v_row;return v_row;
 end if;
 insert into public.location_bathroom_intelligence_sparse as bi(location_id,status,access,confidence,evidence_count,explicit_positive,
  explicit_negative,category_prior,source_score,freshness_score,computed_at,updated_at)
 values(p_location_id,v_status,v_access,v_conf,v_evidence,v_pos,v_neg,v_prior,v_source,v_fresh,now(),now())
 on conflict(location_id) do update set status=excluded.status,access=excluded.access,confidence=excluded.confidence,
 evidence_count=excluded.evidence_count,explicit_positive=excluded.explicit_positive,explicit_negative=excluded.explicit_negative,
 category_prior=excluded.category_prior,source_score=excluded.source_score,freshness_score=excluded.freshness_score,
 computed_at=excluded.computed_at,updated_at=now() returning * into v_row;
 return v_row;
end $function$;
revoke all on function public.compute_bathroom_intelligence(uuid) from public,anon,authenticated;
grant execute on function public.compute_bathroom_intelligence(uuid) to service_role;

-- Rebind existing read routines after the table-to-view compatibility swap.
do $$
declare r record;
begin
 for r in select pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prokind in('f','p') and n.nspname='public'
    and p.proname not in('compute_bathroom_intelligence','refresh_location_bathroom_intelligence_trigger')
    and pg_get_functiondef(p.oid) ilike '%location_bathroom_intelligence%'
 loop execute r.def;end loop;
end $$;

create or replace view public.location_bathroom_signals with (security_invoker=true) as
select l.id location_id,l.name,l.place_type,coalesce(bi.status,'unknown') bathroom_status,
 coalesce(bi.access,'unknown') bathroom_access,coalesce(bi.confidence,0) bathroom_confidence,
 coalesce(bi.evidence_count,0) bathroom_evidence_count,bi.computed_at
from public.locations l left join public.location_bathroom_intelligence bi on bi.location_id=l.id;

delete from public.location_bathroom_intelligence_sparse
where coalesce(evidence_count,0)=0 and coalesce(freshness_score,0)=0
 and not coalesce(explicit_positive,false) and not coalesce(explicit_negative,false);

-- Legacy payload cleanup is deliberately batched to avoid a Free-plan WAL spike.
create or replace function public.strip_legacy_location_metadata_batch(p_limit integer default 1000)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_count integer:=0;v_remaining bigint:=0;
begin
 if session_user<>'postgres' and coalesce(auth.jwt()->>'role','')<>'service_role' and current_user<>'service_role'
    and not coalesce(public.is_platform_owner(auth.uid()),false)
 then raise exception 'service_role or platform owner required' using errcode='42501';end if;
 with target as(
  select id from public.locations where source_metadata?'captured_at' or source_metadata?'source_dataset'
  order by id limit greatest(1,least(coalesce(p_limit,1000),5000)) for update skip locked)
 update public.locations l set source_metadata=l.source_metadata-'captured_at'-'source_dataset' from target t where l.id=t.id;
 get diagnostics v_count=row_count;
 select count(*) into v_remaining from public.locations where source_metadata?'captured_at' or source_metadata?'source_dataset';
 return jsonb_build_object('updated',v_count,'remaining',v_remaining);
end $function$;
revoke all on function public.strip_legacy_location_metadata_batch(integer) from public,anon,authenticated;
grant execute on function public.strip_legacy_location_metadata_batch(integer) to service_role;
