create index if not exists idx_location_address_backfills_fetched_at on public.location_address_backfills(fetched_at desc);
create index if not exists idx_location_verification_targets_status_priority on public.location_verification_targets(status,priority desc);
create or replace function public.select_location_verification_targets(p_limit integer default 25)
returns table(location_id uuid, priority numeric, reason text)
language sql security definer set search_path=public
as $$
with ranked as (
 select l.id as location_id,
 round((case when coalesce(l.review_count,0)>0 then ln(1+l.review_count::numeric)*12 else 0 end + case when l.is_active then 8 else 0 end + case when l.source='osm' then 4 else 0 end + case when l.verification_status <> 'verified' then 10 else 0 end + case when coalesce(l.bathroom_verification_count,0)=0 then 6 else 0 end + case when l.address is null or trim(l.address)='' then 3 else 0 end),2) as priority,
 case when coalesce(l.review_count,0)>=10 then 'high-traffic location' when coalesce(l.bathroom_verification_count,0)=0 then 'unverified public-access bathroom' when l.address is null or trim(l.address)='' then 'missing address' else 'low-verification location' end as reason,
 l.updated_at
 from public.locations l
 where l.is_active=true and l.latitude is not null and l.longitude is not null and l.verification_status <> 'verified'
 and not exists(select 1 from public.location_verification_targets t where t.location_id=l.id and t.status in ('pending','selected'))
)
select location_id,priority,reason from ranked order by priority desc,updated_at asc nulls first limit greatest(0,least(coalesce(p_limit,25),100));
$$;
create or replace function public.record_location_verification(p_location_id uuid,p_has_public_bathroom boolean,p_latitude double precision default null,p_longitude double precision default null,p_method text default 'community')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_id uuid; v_distance double precision; v_positive integer;
begin
 v_user:=auth.uid(); if v_user is null then raise exception 'Authentication required'; end if;
 if p_latitude is not null and p_longitude is not null then select st_distance(l.geom,st_setsrid(st_makepoint(p_longitude,p_latitude),4326)::geography) into v_distance from public.locations l where l.id=p_location_id; if v_distance is not null and v_distance>1000 then raise exception 'Verification must be within 1 km of the location'; end if; end if;
 insert into public.location_bathroom_verifications(location_id,user_id,has_public_bathroom,verification_method,latitude,longitude,distance_meters) values(p_location_id,v_user,p_has_public_bathroom,coalesce(p_method,'community'),p_latitude,p_longitude,v_distance) returning id into v_id;
 update public.locations set bathroom_verification_count=coalesce(bathroom_verification_count,0)+1,bathroom_positive_count=coalesce(bathroom_positive_count,0)+case when p_has_public_bathroom then 1 else 0 end,bathroom_negative_count=coalesce(bathroom_negative_count,0)+case when p_has_public_bathroom then 0 else 1 end,bathroom_verified_at=now(),bathroom_verification_source=coalesce(p_method,'community'),bathroom_verification_status=case when p_has_public_bathroom then 'verified' else 'not_available' end,updated_at=now() where id=p_location_id returning bathroom_positive_count into v_positive;
 if v_positive>=2 then update public.locations set verification_status='verified',updated_at=now() where id=p_location_id; end if;
 return jsonb_build_object('verification_id',v_id,'location_id',p_location_id,'distance_meters',v_distance,'positive_verifications',v_positive);
end; $$;
