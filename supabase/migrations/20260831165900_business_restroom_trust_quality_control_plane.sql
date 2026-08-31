create or replace function public.business_restroom_trust_quality(p_business_id uuid,p_location_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and coalesce(bm.status,'active')='active') then raise exception 'BUSINESS_ACCESS_DENIED'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'location_id',l.id,'name',l.name,'quality',public.get_location_trust_quality(l.id),'conflicts',public.get_location_trust_conflicts(l.id)
 ) order by l.name),'[]'::jsonb) into result
 from public.locations l join public.business_locations bl on bl.location_id=l.id and bl.business_id=p_business_id
 where l.is_active=true and (p_location_id is null or l.id=p_location_id);
 return jsonb_build_object('business_id',p_business_id,'location_id',p_location_id,'locations',result,'generated_at',now());
end;
$function$;

revoke all on function public.business_restroom_trust_quality(uuid,uuid) from public, anon;
grant execute on function public.business_restroom_trust_quality(uuid,uuid) to authenticated, service_role;
