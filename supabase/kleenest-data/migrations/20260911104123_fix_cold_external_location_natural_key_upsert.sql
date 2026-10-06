create or replace function public.archive_ingest_batch(p_kind text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','archive','pg_temp'
as $function$
declare
  v_count integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  if p_kind = 'external_data_sources' then
    insert into archive.external_data_sources (id,source_key,name,source_url,license_name,license_url,attribution_text,active,created_at,updated_at)
    select id,source_key,name,source_url,license_name,license_url,attribution_text,active,created_at,updated_at
    from jsonb_to_recordset(p_rows) as x(id uuid,source_key text,name text,source_url text,license_name text,license_url text,attribution_text text,active boolean,created_at timestamptz,updated_at timestamptz)
    on conflict (id) do update set source_key=excluded.source_key,name=excluded.name,source_url=excluded.source_url,license_name=excluded.license_name,license_url=excluded.license_url,attribution_text=excluded.attribution_text,active=excluded.active,created_at=excluded.created_at,updated_at=excluded.updated_at,archived_at=now();
  elsif p_kind = 'external_location_records' then
    insert into archive.external_location_records (id,source_id,external_id,record_type,location_id,latitude,longitude,name,raw_data,first_seen_at,last_seen_at,source_updated_at,active)
    select id,source_id,external_id,record_type,location_id,latitude,longitude,name,coalesce(raw_data,'{}'::jsonb),first_seen_at,last_seen_at,source_updated_at,active
    from jsonb_to_recordset(p_rows) as x(id uuid,source_id uuid,external_id text,record_type text,location_id uuid,latitude double precision,longitude double precision,name text,raw_data jsonb,first_seen_at timestamptz,last_seen_at timestamptz,source_updated_at timestamptz,active boolean)
    on conflict (source_id,external_id) do update set
      record_type=excluded.record_type,
      location_id=excluded.location_id,
      latitude=excluded.latitude,
      longitude=excluded.longitude,
      name=excluded.name,
      raw_data=excluded.raw_data,
      first_seen_at=least(archive.external_location_records.first_seen_at,excluded.first_seen_at),
      last_seen_at=greatest(archive.external_location_records.last_seen_at,excluded.last_seen_at),
      source_updated_at=coalesce(excluded.source_updated_at,archive.external_location_records.source_updated_at),
      active=excluded.active,
      archived_at=now();
  elsif p_kind = 'external_observations' then
    insert into archive.external_observations (id,source_id,external_record_id,location_id,attribute_key,value_text,value_numeric,value_boolean,value_json,observed_at,imported_at,confidence,verification_state,provenance)
    select id,source_id,external_record_id,location_id,attribute_key,value_text,value_numeric,value_boolean,value_json,observed_at,imported_at,confidence,verification_state,coalesce(provenance,'{}'::jsonb)
    from jsonb_to_recordset(p_rows) as x(id uuid,source_id uuid,external_record_id uuid,location_id uuid,attribute_key text,value_text text,value_numeric numeric,value_boolean boolean,value_json jsonb,observed_at timestamptz,imported_at timestamptz,confidence numeric,verification_state text,provenance jsonb)
    on conflict (id) do update set source_id=excluded.source_id,external_record_id=excluded.external_record_id,location_id=excluded.location_id,attribute_key=excluded.attribute_key,value_text=excluded.value_text,value_numeric=excluded.value_numeric,value_boolean=excluded.value_boolean,value_json=excluded.value_json,observed_at=excluded.observed_at,imported_at=excluded.imported_at,confidence=excluded.confidence,verification_state=excluded.verification_state,provenance=excluded.provenance,archived_at=now();
  elsif p_kind = 'national_ingestion_runs' then
    insert into archive.national_ingestion_runs (id,market_id,source_key,status,requests_used,bytes_downloaded,records_seen,records_imported,records_updated,detail,error,started_at,finished_at)
    select id,market_id,source_key,status,requests_used,bytes_downloaded,records_seen,records_imported,records_updated,coalesce(detail,'{}'::jsonb),error,started_at,finished_at
    from jsonb_to_recordset(p_rows) as x(id uuid,market_id uuid,source_key text,status text,requests_used integer,bytes_downloaded bigint,records_seen integer,records_imported integer,records_updated integer,detail jsonb,error text,started_at timestamptz,finished_at timestamptz)
    on conflict (id) do update set market_id=excluded.market_id,source_key=excluded.source_key,status=excluded.status,requests_used=excluded.requests_used,bytes_downloaded=excluded.bytes_downloaded,records_seen=excluded.records_seen,records_imported=excluded.records_imported,records_updated=excluded.records_updated,detail=excluded.detail,error=excluded.error,started_at=excluded.started_at,finished_at=excluded.finished_at,archived_at=now();
  else
    raise exception 'unsupported archive kind: %', p_kind;
  end if;

  get diagnostics v_count = row_count;
  return jsonb_build_object('kind',p_kind,'rows_upserted',v_count);
end;
$function$;
