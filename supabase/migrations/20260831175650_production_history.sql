create or replace function public.notify_business_restroom_remediation_opened()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.notifications(user_id,type,title,body,data)
  select bm.user_id,'business_remediation_opened','Restroom issue needs attention',
         coalesce(l.name,'A restroom')||' · '||coalesce(a.name,'Amenity')||' needs operational attention.',
         jsonb_build_object('business_id',new.business_id,'case_id',new.id,'location_id',new.location_id,'amenity_id',new.amenity_id,'priority',new.priority)
  from public.business_members bm
  join public.locations l on l.id=new.location_id
  join public.amenities a on a.id=new.amenity_id
  where bm.business_id=new.business_id and lower(bm.role::text) in ('owner','admin','manager');
  return new;
end $$;

drop trigger if exists trg_business_restroom_remediation_opened on public.business_restroom_remediation_cases;
create trigger trg_business_restroom_remediation_opened after insert on public.business_restroom_remediation_cases for each row execute function public.notify_business_restroom_remediation_opened();
revoke all on function public.notify_business_restroom_remediation_opened() from public,anon,authenticated;
grant execute on function public.notify_business_restroom_remediation_opened() to service_role;
