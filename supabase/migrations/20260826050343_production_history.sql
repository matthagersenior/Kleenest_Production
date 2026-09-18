do $$
declare fn text; original text;
begin
  select pg_get_functiondef('public.map_network_nearby_v1(double precision,double precision,integer,integer,text,text,text[])'::regprocedure) into fn;
  original := fn;
  fn := replace(fn, '(lower(p_category)=''government'' and lower(coalesce(p.category,l.place_type,'''')) like ''%government%'')', '(lower(p_category)=''government'' and (lower(coalesce(p.category,l.place_type,'''')) like ''%government%'' or lower(coalesce(l.name,'''')) like any(array[''%city hall%'',''%town hall%'',''%county office%'',''%courthouse%'',''%court house%'',''%municipal%'',''%public library%'',''%library district%'',''%post office%'',''%dmv%'',''%department of motor vehicles%'']) or lower(coalesce(l.source_metadata->>''government'','''')) in (''true'',''yes'') or lower(coalesce(l.source_metadata->>''is_government'','''')) in (''true'',''yes'')))');
  if fn = original then raise exception 'government clause not found; refusing rewrite'; end if;
  execute fn;
end $$;
grant execute on function public.map_network_nearby_v1(double precision,double precision,integer,integer,text,text,text[]) to anon,authenticated;
