revoke all on public.semantic_search_queries from anon, authenticated;
create policy semantic_search_queries_own_insert on public.semantic_search_queries for insert to authenticated with check (user_id = auth.uid());
create policy semantic_search_queries_own_select on public.semantic_search_queries for select to authenticated using (user_id = auth.uid());
revoke execute on function public.semantic_location_search(text,double precision,double precision,integer,integer) from anon;
grant execute on function public.semantic_location_search(text,double precision,double precision,integer,integer) to authenticated;
