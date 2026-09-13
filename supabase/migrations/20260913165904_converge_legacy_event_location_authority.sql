
create or replace function public.business_update_event(
  p_business_id uuid,p_event_id uuid,p_location_id uuid,p_title text,p_description text,
  p_event_date date,p_event_time time
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;
  if not public.business_advanced_allowed(p_business_id) then
    raise exception 'Business Growth, Fleet, or Enterprise plan required';
  end if;
  if p_location_id is not null
     and not public.location_belongs_to_business(p_business_id,p_location_id) then
    raise exception 'Location does not belong to business';
  end if;
  if nullif(trim(coalesce(p_title,'')),'') is null then
    raise exception 'Event title is required';
  end if;

  update public.business_events
     set location_id=p_location_id,
         title=trim(p_title),
         description=nullif(trim(p_description),''),
         event_date=p_event_date,
         event_time=p_event_time
   where id=p_event_id and business_id=p_business_id;

  if not found then raise exception 'Event not found'; end if;
  return p_event_id;
end;
$$;

revoke all on function public.business_update_event(uuid,uuid,uuid,text,text,date,time) from public,anon;
grant execute on function public.business_update_event(uuid,uuid,uuid,text,text,date,time) to authenticated,service_role;
