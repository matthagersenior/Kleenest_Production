-- Bridge legacy Fused Overture GERS identities into the canonical Overture source.
-- Existing locations are retained; future official Overture rows resolve to them instead of duplicating them.
CREATE OR REPLACE FUNCTION public.resolve_location_external_identity_v2(p_source_dataset text, p_source_external_id text, p_latitude double precision, p_longitude double precision, p_name text DEFAULT NULL::text, p_brand text DEFAULT NULL::text, p_operator text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_brand_key text:=public.normalize_brand_key(p_brand);
  v_name_key text:=public.normalize_brand_key(p_name);
begin
  if p_source_dataset is not null and p_source_external_id is not null then
    select l.id into v_id
    from public.locations l
    where l.source_dataset=p_source_dataset
      and l.source_external_id=p_source_external_id
    limit 1;
    if v_id is not null then return v_id; end if;

    select elr.location_id into v_id
    from public.external_location_records elr
    join public.external_data_sources eds on eds.id=elr.source_id
    where eds.source_key=p_source_dataset
      and elr.external_id=p_source_external_id
      and elr.location_id is not null
    limit 1;
    if v_id is not null then return v_id; end if;

    if p_source_dataset='overture' and p_source_external_id like 'overture:%' then
      select elr.location_id into v_id
      from public.external_location_records elr
      join public.external_data_sources eds on eds.id=elr.source_id
      where eds.source_key='overture_places'
        and elr.external_id=substr(p_source_external_id,length('overture:')+1)
        and elr.location_id is not null
      limit 1;
      if v_id is not null then return v_id; end if;
    end if;
  end if;

  if p_latitude is null or p_longitude is null then return null; end if;

  select l.id into v_id
  from public.locations l
  left join public.location_brand_identities bi on bi.location_id=l.id
  where coalesce(l.is_active,true)
    and l.latitude between p_latitude-0.00055 and p_latitude+0.00055
    and l.longitude between p_longitude-0.00055 and p_longitude+0.00055
    and (
      (v_brand_key is not null and public.normalize_brand_key(coalesce(bi.canonical_brand,l.brand_name))=v_brand_key)
      or (v_name_key is not null and public.normalize_brand_key(l.name)=v_name_key)
      or (
        nullif(trim(coalesce(p_address,'')),'') is not null
        and lower(trim(coalesce(l.address,'')))=lower(trim(p_address))
        and (nullif(trim(coalesce(p_city,'')),'') is null or lower(trim(coalesce(l.city,'')))=lower(trim(p_city)))
        and (nullif(trim(coalesce(p_state,'')),'') is null or lower(trim(coalesce(l.state,'')))=lower(trim(p_state)))
      )
    )
  order by
    case
      when v_brand_key is not null and public.normalize_brand_key(coalesce(bi.canonical_brand,l.brand_name))=v_brand_key then 0
      when v_name_key is not null and public.normalize_brand_key(l.name)=v_name_key then 1
      else 2
    end,
    abs(l.latitude-p_latitude)+abs(l.longitude-p_longitude)
  limit 1;

  return v_id;
end;
$function$

