create or replace function public.business_operations_inventory(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  return jsonb_build_object(
    'business_id',p_business_id,
    'advanced_allowed',public.business_advanced_allowed(p_business_id),
    'locations',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc) from public.locations l where l.business_id=p_business_id),'[]'::jsonb),
    'promotions',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from public.promotions p where p.business_id=p_business_id),'[]'::jsonb),
    'campaigns',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from public.enterprise_partner_campaigns c join public.enterprise_partner_networks n on n.id=c.network_id where n.owner_business_id=p_business_id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.event_date desc nulls last,e.event_time desc nulls last,e.created_at desc) from public.business_events e where e.business_id=p_business_id),'[]'::jsonb),
    'qr_codes',coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from public.qr_codes q where q.business_id=p_business_id or q.location_id in(select l.id from public.locations l where l.business_id=p_business_id)),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.reviews r where r.location_id in(select l.id from public.locations l where l.business_id=p_business_id)),'[]'::jsonb),
    'contests',coalesce((select jsonb_agg(to_jsonb(c) order by c.starts_at desc nulls last,c.created_at desc) from public.contests c where c.business_id=p_business_id),'[]'::jsonb),
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'location_id',p.location_id,'storage_path',p.storage_path,'caption',p.caption,'media_type',p.media_type,'mime_type',p.mime_type,'size_bytes',p.size_bytes,'width',p.width,'height',p.height,'sort_order',p.sort_order,'created_at',p.created_at,'location_name',l.name) order by p.created_at desc) from public.location_photos p join public.locations l on l.id=p.location_id where l.business_id=p_business_id),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.business_operations_inventory(uuid) from public,anon;
grant execute on function public.business_operations_inventory(uuid) to authenticated,service_role;
