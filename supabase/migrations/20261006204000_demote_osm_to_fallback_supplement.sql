-- OSM public Overpass endpoints are too unreliable for continuous background
-- corridor acquisition. Keep OSM enabled for selective discovery fallback and
-- supplementation, while primary background growth continues through open-data
-- ingestion and canonicalization.

do $$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
    from cron.job
   where jobname = 'kleenest-corridor-ingestion'
   limit 1;

  if v_job_id is not null then
    perform cron.alter_job(v_job_id, active := false);
  end if;
end
$$;

update public.national_ingestion_source_policies
   set enabled = true,
       notes = case
         when coalesce(notes, '') like '%OSM is fallback/supplement only%'
           then notes
         else concat_ws(
           E'\n',
           nullif(notes, ''),
           'Background OSM corridor acquisition disabled: OSM is fallback/supplement only; interactive discovery may use it when primary sources are thin or unavailable.'
         )
       end,
       updated_at = now()
 where source_key = 'osm';
