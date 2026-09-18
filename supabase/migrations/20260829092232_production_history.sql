create or replace function public.business_qr_detail(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now()) returns jsonb language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id)
     and not public.is_platform_owner_session()
     and not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and lower(coalesce(bm.role,'')) in ('analyst','admin','owner','manager'))
  then raise exception 'Not authorized for this business'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.check_ins desc,x.label) from (
    select q.id,q.code,q.label,q.active,q.customization,q.purpose,q.action_type,q.action_payload,q.single_use,q.max_redemptions,l.id location_id,l.name location_name,
      count(ci.id) filter(where ci.checked_in_at between p_start and p_end) check_ins,
      count(distinct ci.user_id) filter(where ci.checked_in_at between p_start and p_end) unique_users,
      (select count(*) from public.qr_attribution_events ae where ae.qr_code_id=q.id and ae.created_at between p_start and p_end) scans,
      (select count(*) from public.qr_redemptions r where r.qr_code_id=q.id and r.redeemed_at between p_start and p_end) redemptions,
      max(ci.checked_in_at) last_check_in,
      (select count(*) from public.qr_engagement_programs ep where ep.qr_code_id=q.id) engagement_programs
    from public.qr_codes q join public.locations l on l.id=q.location_id left join public.check_ins ci on ci.qr_code_id=q.id
    where q.business_id=p_business_id group by q.id,l.id
  ) x),'[]'::jsonb);
end;$function$;
