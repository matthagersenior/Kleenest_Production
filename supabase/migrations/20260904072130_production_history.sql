create or replace function public.qr_studio_list_assets(
  p_business_id uuid,
  p_from timestamptz default now()-interval '30 days',
  p_to timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) and not public.is_platform_owner_session() then
    raise exception 'Business management access required';
  end if;

  select coalesce(jsonb_agg(item order by (item->>'created_at')::timestamptz desc),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id',q.id,
      'business_id',q.business_id,
      'location_id',q.location_id,
      'location_name',l.name,
      'location_address',l.address,
      'code',q.code,
      'label',q.label,
      'active',q.active,
      'purpose',q.purpose,
      'action_type',q.action_type,
      'action_payload',q.action_payload,
      'customization',q.customization,
      'single_use',q.single_use,
      'max_redemptions',q.max_redemptions,
      'created_at',q.created_at,
      'last_activity_at',(
        select max(a.created_at) from public.qr_attribution_events a
        where a.qr_code_id=q.id and a.created_at>=coalesce(p_from,now()-interval '30 days') and a.created_at<=coalesce(p_to,now())
      ),
      'scan_count',(
        select count(*) from public.qr_attribution_events a
        where a.qr_code_id=q.id and a.created_at>=coalesce(p_from,now()-interval '30 days') and a.created_at<=coalesce(p_to,now())
      ),
      'unique_users',(
        select count(distinct a.user_id) from public.qr_attribution_events a
        where a.qr_code_id=q.id and a.user_id is not null and a.created_at>=coalesce(p_from,now()-interval '30 days') and a.created_at<=coalesce(p_to,now())
      ),
      'redemption_count',(
        select count(*) from public.qr_redemptions r
        where r.qr_code_id=q.id and r.redeemed_at>=coalesce(p_from,now()-interval '30 days') and r.redeemed_at<=coalesce(p_to,now())
      ),
      'program_count',(select count(*) from public.qr_engagement_programs p where p.qr_code_id=q.id and p.active=true),
      'version_count',(select count(*) from public.qr_code_versions v where v.qr_code_id=q.id)
    ) item
    from public.qr_codes q
    left join public.locations l on l.id=q.location_id
    where q.business_id=p_business_id
  ) x;
  return v_result;
end;
$$;

grant execute on function public.qr_studio_list_assets(uuid,timestamptz,timestamptz) to authenticated;
