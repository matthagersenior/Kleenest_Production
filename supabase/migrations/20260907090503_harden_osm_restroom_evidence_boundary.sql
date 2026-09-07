create or replace function public.osm_restroom_evidence_is_contradictory(p_source text, p_metadata jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    lower(coalesce(p_source,'')) = 'osm'
    and nullif(lower(trim(coalesce(
      p_metadata->'evidence'->>'amenity',
      p_metadata->'osm_tags'->>'amenity',
      p_metadata->>'amenity',
      ''
    ))),'') is not null
    and lower(coalesce(
      p_metadata->'evidence'->>'amenity',
      p_metadata->'osm_tags'->>'amenity',
      p_metadata->>'amenity',
      ''
    )) not in ('toilets','restroom','bathroom')
    and lower(coalesce(
      p_metadata->'evidence'->>'toilets',
      p_metadata->'osm_tags'->>'toilets',
      p_metadata->>'toilets',
      ''
    )) not in ('yes','public','customers','permissive')
    and lower(coalesce(
      p_metadata->'evidence'->>'building',
      p_metadata->'osm_tags'->>'building',
      p_metadata->>'building',
      ''
    )) <> 'toilets'
    and lower(coalesce(
      p_metadata->'evidence'->>'restroom',
      p_metadata->'osm_tags'->>'restroom',
      p_metadata->>'restroom',
      ''
    )) not in ('yes','public','customers','permissive')
    and lower(coalesce(
      p_metadata->'evidence'->>'bathroom',
      p_metadata->'osm_tags'->>'bathroom',
      p_metadata->>'bathroom',
      ''
    )) not in ('yes','public','customers','permissive');
$$;

create or replace function public.sanitize_external_restroom_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.osm_restroom_evidence_is_contradictory(new.source,new.source_metadata)
     and coalesce(new.bathroom_verification_count,0)=0
     and new.bathroom_verified_by is null
     and lower(coalesce(new.bathroom_verification_source,'')) in ('','osm','external_record') then
    if lower(coalesce(new.place_type,'')) in ('restroom','bathroom','toilet') then
      new.place_type := 'place';
    end if;
    if lower(coalesce(new.bathroom_verification_status,'')) in ('has_bathroom','verified')
       or lower(coalesce(new.bathroom_verification_source,'')) in ('osm','external_record') then
      new.bathroom_verification_status := 'unverified';
      new.bathroom_verification_source := null;
      new.bathroom_verified_at := null;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.sanitize_external_restroom_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.location_id is not null
     and lower(coalesce(new.record_type,'')) in ('restroom','bathroom','toilet')
     and exists(
       select 1
       from public.locations l
       where l.id=new.location_id
         and public.osm_restroom_evidence_is_contradictory(l.source,l.source_metadata)
         and coalesce(l.bathroom_verification_count,0)=0
         and l.bathroom_verified_by is null
         and lower(coalesce(l.bathroom_verification_source,'')) in ('','osm','external_record')
     ) then
    new.record_type := 'place';
  end if;
  return new;
end;
$$;

revoke all on function public.osm_restroom_evidence_is_contradictory(text,jsonb) from public,anon,authenticated;
revoke all on function public.sanitize_external_restroom_location() from public,anon,authenticated;
revoke all on function public.sanitize_external_restroom_record() from public,anon,authenticated;

drop trigger if exists sanitize_external_restroom_location_insert on public.locations;
create trigger sanitize_external_restroom_location_insert
before insert on public.locations
for each row execute function public.sanitize_external_restroom_location();

drop trigger if exists sanitize_external_restroom_location_update on public.locations;
create trigger sanitize_external_restroom_location_update
before update of source,source_metadata,place_type,bathroom_verification_status,bathroom_verification_source,bathroom_verification_count,bathroom_verified_by on public.locations
for each row execute function public.sanitize_external_restroom_location();

drop trigger if exists sanitize_external_restroom_record_trigger on public.external_location_records;
create trigger sanitize_external_restroom_record_trigger
before insert or update of location_id,record_type on public.external_location_records
for each row execute function public.sanitize_external_restroom_record();

with suspect as (
  select l.id
  from public.locations l
  where public.osm_restroom_evidence_is_contradictory(l.source,l.source_metadata)
    and coalesce(l.bathroom_verification_count,0)=0
    and l.bathroom_verified_by is null
    and lower(coalesce(l.bathroom_verification_source,'')) in ('','osm','external_record')
    and (
      lower(coalesce(l.place_type,'')) in ('restroom','bathroom','toilet')
      or lower(coalesce(l.bathroom_verification_status,'')) in ('has_bathroom','verified')
    )
)
update public.external_location_records r
set record_type='place'
from suspect s
where r.location_id=s.id
  and lower(coalesce(r.record_type,'')) in ('restroom','bathroom','toilet');

update public.locations l
set place_type=case when lower(coalesce(l.place_type,'')) in ('restroom','bathroom','toilet') then 'place' else l.place_type end,
    bathroom_verification_status='unverified',
    bathroom_verification_source=null,
    bathroom_verified_at=null,
    updated_at=now()
where public.osm_restroom_evidence_is_contradictory(l.source,l.source_metadata)
  and coalesce(l.bathroom_verification_count,0)=0
  and l.bathroom_verified_by is null
  and lower(coalesce(l.bathroom_verification_source,'')) in ('','osm','external_record')
  and (
    lower(coalesce(l.place_type,'')) in ('restroom','bathroom','toilet')
    or lower(coalesce(l.bathroom_verification_status,'')) in ('has_bathroom','verified')
  );
