do $$
declare fn text; original text;
begin
  select pg_get_functiondef('public.map_network_nearby_v1(double precision,double precision,integer,integer,text,text,text[])'::regprocedure) into fn;
  original := fn;
  fn := replace(fn, 'when lower(coalesce(p_category,''''))=''cooling_center'' then ''cooling_center'' when r.brand_name is not null', 'when lower(coalesce(p_category,''''))=''cooling_center'' then ''cooling_center'' when lower(coalesce(p_category,''''))=''government'' then ''government'' when r.brand_name is not null');
  if fn = original then raise exception 'government output case not found; refusing rewrite'; end if;
  execute fn;
end $$;
