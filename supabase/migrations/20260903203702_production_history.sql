create or replace function public.capability_classification_summary()
returns table(domain text, classification text, function_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode = '42501';
  end if;

  return query
  select c.domain, c.classification, count(*)
  from public.capability_function_classifications c
  group by c.domain, c.classification
  order by c.domain, c.classification;
end;
$$;

revoke all on function public.capability_classification_summary() from public;
revoke execute on function public.capability_classification_summary() from anon;
grant execute on function public.capability_classification_summary() to authenticated;
grant execute on function public.capability_classification_summary() to service_role;
