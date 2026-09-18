update public.external_data_sources set active=false where source_key='openstreetmap'; update public.external_data_sources set active=true where source_key='osm';
