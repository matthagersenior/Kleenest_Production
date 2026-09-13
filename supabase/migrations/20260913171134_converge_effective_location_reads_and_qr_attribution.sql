
create or replace function public.location_belongs_to_business(p_business_id uuid,p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.locations l
    where l.id=p_location_id
      and coalesce(l.claimed_business_id,l.business_id)=p_business_id
  );
$$;

revoke all on function public.location_belongs_to_business(uuid,uuid) from public,anon,authenticated;
grant execute on function public.location_belongs_to_business(uuid,uuid) to service_role;

do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
      and has_function_privilege('authenticated',p.oid,'execute')
      and p.proname=any(array[
        'business_amenity_feedback_analytics',
        'business_dashboard_secure_summary',
        'business_ensure_live_network_geofences',
        'business_growth_analytics',
        'business_list_amenities',
        'business_location_analytics',
        'business_location_detail',
        'business_location_intelligence',
        'business_location_metrics',
        'business_location_scoped_analytics',
        'business_media_analytics',
        'business_media_detail',
        'business_occupancy_analytics',
        'business_onboarding_apply',
        'business_operations_inventory',
        'business_qr_analytics',
        'business_restroom_prevention_recommendations',
        'business_restroom_reliability',
        'business_restroom_remediation_operations',
        'business_restroom_remediation_performance',
        'business_review_analytics',
        'business_review_detail',
        'business_rewards_analytics',
        'business_summary_analytics',
        'business_visitors_analytics',
        'fleet_restroom_prevention_portfolio',
        'fleet_restroom_remediation_risk',
        'live_network_motif_snapshot',
        'partner_preferred_analytics'
      ])
  loop
    v_def:=pg_get_functiondef(r.oid);
    v_new:=regexp_replace(
      v_def,
      '(l2|l|loc|location)\.business_id\s*=\s*p_business_id',
      'coalesce(\1.claimed_business_id,\1.business_id)=p_business_id',
      'gi'
    );

    if v_new is distinct from v_def then
      execute v_new;
    end if;
  end loop;
end $$;

create or replace function public.record_qr_attribution(
  p_code text,
  p_action_type text default 'scan',
  p_source text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_qr public.qr_codes;
  v_id uuid;
  v_business uuid;
  v_location uuid;
  v_campaign uuid;
  v_promotion uuid;
  v_program uuid;
  v_meta jsonb:=coalesce(p_metadata,'{}'::jsonb);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_code),'') is null or length(trim(p_code))>256 then
    raise exception 'QR code is required';
  end if;

  select * into v_qr
  from public.qr_codes
  where code=trim(p_code) and coalesce(active,true)
  limit 1;
  if not found then raise exception 'QR code not found or inactive'; end if;

  v_location:=v_qr.location_id;
  v_business:=v_qr.business_id;

  if v_location is not null then
    select coalesce(v_business,l.claimed_business_id,l.business_id)
      into v_business
    from public.locations l
    where l.id=v_location and coalesce(l.is_active,true);

    if not found then raise exception 'QR location unavailable'; end if;
  end if;

  begin v_campaign:=(v_meta->>'campaign_id')::uuid;
  exception when invalid_text_representation then v_campaign:=null; end;
  begin v_promotion:=(v_meta->>'promotion_id')::uuid;
  exception when invalid_text_representation then v_promotion:=null; end;
  begin v_program:=(v_meta->>'engagement_program_id')::uuid;
  exception when invalid_text_representation then v_program:=null; end;

  if v_campaign is not null and not exists(
    select 1
    from public.business_campaigns bc
    where bc.id=v_campaign
      and bc.business_id=v_business
      and (bc.location_id is null or bc.location_id=v_location)
    union all
    select 1
    from public.enterprise_partner_campaigns ec
    join public.enterprise_partner_networks en on en.id=ec.network_id
    where ec.id=v_campaign and en.owner_business_id=v_business
  ) then
    v_campaign:=null;
  end if;

  if v_promotion is not null and not exists(
    select 1
    from public.promotions p
    where p.id=v_promotion
      and p.business_id=v_business
      and (p.location_id is null or p.location_id=v_location)
  ) then
    v_promotion:=null;
  end if;

  if v_program is not null and not exists(
    select 1
    from public.qr_engagement_programs qep
    where qep.id=v_program and qep.qr_code_id=v_qr.id
  ) then
    v_program:=null;
  end if;

  insert into public.qr_attribution_events(
    qr_code_id,location_id,business_id,user_id,action_type,source,
    campaign_id,promotion_id,engagement_program_id,metadata
  )
  values(
    v_qr.id,v_location,v_business,auth.uid(),
    left(coalesce(nullif(trim(p_action_type),''),'scan'),80),
    left(nullif(trim(coalesce(p_source,'')),''),120),
    v_campaign,v_promotion,v_program,
    v_meta
      - array['campaign_id','promotion_id','engagement_program_id']::text[]
      || jsonb_build_object('attribution_authority','qr_business')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_qr_attribution(text,text,text,jsonb) from public,anon;
grant execute on function public.record_qr_attribution(text,text,text,jsonb) to authenticated,service_role;
