create or replace function public.refresh_location_bathroom_intelligence_trigger() returns trigger language plpgsql security definer set search_path=public,extensions as $$ begin perform public.compute_bathroom_intelligence(coalesce(new.location_id,new.id)); return coalesce(new,old); end $$;

drop trigger if exists trg_external_observations_bathroom_intelligence on public.external_observations;
create trigger trg_external_observations_bathroom_intelligence after insert or update on public.external_observations for each row when (lower(coalesce(new.attribute_key,'')) like '%toilets%') execute function public.refresh_location_bathroom_intelligence_trigger();

drop trigger if exists trg_locations_bathroom_intelligence on public.locations;
create trigger trg_locations_bathroom_intelligence after insert or update of place_type on public.locations for each row execute function public.refresh_location_bathroom_intelligence_trigger();

select count(*) as intelligence_rows, count(*) filter(where status='confirmed') as confirmed, count(*) filter(where status='likely') as likely, count(*) filter(where status='uncertain') as uncertain, count(*) filter(where status='no_bathroom') as no_bathroom, count(*) filter(where status='unknown') as unknown from public.location_bathroom_intelligence;
