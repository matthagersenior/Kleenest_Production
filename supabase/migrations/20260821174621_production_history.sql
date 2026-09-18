do $$
declare
  inserted_count integer;
  deleted_count integer;
begin
  with candidates as (
    select d.id,
           d.subject_id as user_id,
           d.occurred_at,
           d.feature_code,
           d.value_text,
           d.value_numeric,
           d.metadata,
           (jsonb_array_elements_text(coalesce(d.metadata->'result_location_ids','[]'::jsonb)))::uuid as place_id
    from public.data_feature_events d
    where d.event_type='search'
      and d.location_id is null
      and jsonb_typeof(d.metadata->'result_location_ids')='array'
  ), mapped as (
    select c.*,p.location_id
    from candidates c
    join public.places p on p.id=c.place_id
    where p.location_id is not null
  ), inserted as (
    insert into public.data_feature_events(
      event_type,feature_code,subject_type,subject_id,location_id,business_id,fleet_vehicle_id,
      source_table,source_id,value_numeric,value_text,metadata,occurred_at
    )
    select 'search',m.feature_code,'location',m.location_id,null,null,null,'client',null,
           1,m.value_text,
           m.metadata || jsonb_build_object('attribution','search_result_backfill','source_search_event_id',m.id,'place_id',m.place_id),
           m.occurred_at
    from mapped m
    returning id
  )
  select count(*) into inserted_count from inserted;

  delete from public.data_feature_events d
  where d.event_type='search'
    and d.location_id is null
    and jsonb_typeof(d.metadata->'result_location_ids')='array'
    and exists (
      select 1
      from jsonb_array_elements_text(coalesce(d.metadata->'result_location_ids','[]'::jsonb)) x(place_id)
      join public.places p on p.id=x.place_id::uuid
      where p.location_id is not null
    );
  get diagnostics deleted_count = row_count;
  raise notice 'attributed search events inserted=%, original search events removed=%',inserted_count,deleted_count;
end $$;
