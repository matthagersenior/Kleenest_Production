create or replace function public.refresh_location_bathroom_intelligence_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if tg_table_name = 'locations' then
    perform public.compute_bathroom_intelligence(new.id);
  else
    perform public.compute_bathroom_intelligence(new.location_id);
  end if;
  return coalesce(new, old);
end;
$function$;
