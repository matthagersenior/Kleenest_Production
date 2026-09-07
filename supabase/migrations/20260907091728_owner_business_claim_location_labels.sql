create or replace function public.admin_business_detail(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required'; end if;
  if p_business_id is null then raise exception 'business required'; end if;
  return jsonb_build_object(
    'business',(select jsonb_build_object('id',b.id,'name',b.name,'business_tier',b.business_tier::text,'verification_status',b.verification_status::text,'email',b.email,'phone',b.phone,'website',b.website,'updated_at',b.updated_at) from public.businesses b where b.id=p_business_id),
    'access',public.admin_get_business_access(p_business_id),
    'members',public.admin_list_business_members(p_business_id),
    'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'address',l.address,'city',l.city,'state',l.state,'verification_status',l.verification_status::text) order by l.name) from public.locations l where l.business_id=p_business_id or l.claimed_business_id=p_business_id),'[]'::jsonb),
    'claims',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',c.id,
          'location_id',c.location_id,
          'location_name',l.name,
          'location_address',l.address,
          'location_city',l.city,
          'location_state',l.state,
          'claimed_by',c.claimed_by,
          'status',c.status,
          'created_at',c.created_at
        ) order by c.created_at desc
      )
      from public.location_claims c
      left join public.locations l on l.id=c.location_id
      where c.business_id=p_business_id
    ),'[]'::jsonb)
  );
end
$function$;
