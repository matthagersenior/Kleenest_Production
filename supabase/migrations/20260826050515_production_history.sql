do $$
declare fn text; original text;
begin
  select pg_get_functiondef('public.map_network_nearby_v1(double precision,double precision,integer,integer,text,text,text[])'::regprocedure) into fn;
  original := fn;
  fn := replace(fn, 'p.category as p_category', 'p.category as place_category');
  fn := replace(fn, 'r.p_category', 'r.place_category');
  if fn = original then raise exception 'category alias not found; refusing rewrite'; end if;
  execute fn;
end $$;
grant execute on function public.map_network_nearby_v1(double precision,double precision,integer,integer,text,text,text[]) to anon,authenticated;
