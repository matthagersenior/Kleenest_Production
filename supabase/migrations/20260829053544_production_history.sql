update public.locations l
set
  address = coalesce(nullif(btrim(l.address), ''), nullif(btrim(coalesce(l.source_metadata->'tags'->>'addr:full','')), ''), nullif(btrim(concat_ws(' ', l.source_metadata->'tags'->>'addr:housenumber', l.source_metadata->'tags'->>'addr:street')), '')),
  city = coalesce(nullif(btrim(l.city), ''), nullif(btrim(l.source_metadata->'tags'->>'addr:city'), '')),
  state = coalesce(nullif(btrim(l.state), ''), nullif(btrim(l.source_metadata->'tags'->>'addr:state'), '')),
  postal_code = coalesce(nullif(btrim(l.postal_code), ''), nullif(btrim(l.source_metadata->'tags'->>'addr:postcode'), '')),
  phone = coalesce(nullif(btrim(l.phone), ''), nullif(btrim(l.source_metadata->'tags'->>'phone'), ''), nullif(btrim(l.source_metadata->'tags'->>'contact:phone'), '')),
  website = coalesce(nullif(btrim(l.website), ''), nullif(btrim(l.source_metadata->'tags'->>'website'), ''), nullif(btrim(l.source_metadata->'tags'->>'contact:website'), '')),
  updated_at = now()
where (lower(coalesce(l.source_dataset,'')) in ('osm','openstreetmap') or lower(coalesce(l.source,''))='osm')
  and jsonb_typeof(l.source_metadata->'tags') = 'object'
  and (
    nullif(btrim(l.address), '') is null
    or nullif(btrim(l.city), '') is null
    or nullif(btrim(l.state), '') is null
    or nullif(btrim(l.postal_code), '') is null
    or nullif(btrim(l.phone), '') is null
    or nullif(btrim(l.website), '') is null
  );
