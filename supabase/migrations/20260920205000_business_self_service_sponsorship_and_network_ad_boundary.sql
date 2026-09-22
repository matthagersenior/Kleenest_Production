-- Separate Kleenest direct sponsorship from removable third-party network ads,
-- and expose a business-scoped self-service campaign authoring boundary.

alter table public.sponsored_campaigns
  add column if not exists business_id uuid references public.businesses(id) on delete cascade,
  add column if not exists submission_status text not null default 'owner_managed',
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

alter table public.sponsored_campaigns
  drop constraint if exists sponsored_campaigns_submission_status_check;
alter table public.sponsored_campaigns
  add constraint sponsored_campaigns_submission_status_check
  check (submission_status in ('owner_managed','draft','submitted','approved','rejected','withdrawn'));

create index if not exists sponsored_campaigns_business_updated_idx
  on public.sponsored_campaigns(business_id,updated_at desc)
  where business_id is not null;

alter table public.ad_placements
  add column if not exists network_fallback_enabled boolean not null default true;

create or replace function public.consumer_network_ads_enabled(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when p_user_id is null then true
    when p_user_id <> auth.uid() then true
    else not public.has_kleenest_premium()
  end;
$$;
revoke all on function public.consumer_network_ads_enabled(uuid) from public;
grant execute on function public.consumer_network_ads_enabled(uuid) to anon,authenticated;

create or replace function public.consumer_ads_enabled(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.consumer_network_ads_enabled(p_user_id);
$$;
revoke all on function public.consumer_ads_enabled(uuid) from public;
grant execute on function public.consumer_ads_enabled(uuid) to anon,authenticated;

create or replace function public.consumer_sponsored_cards(
  p_surface text,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  select coalesce(jsonb_agg(item order by score desc, owner_priority desc),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'campaign_id',c.id,
      'placement_code',p.placement_code,
      'label',c.label,
      'sponsor_name',c.sponsor_name,
      'headline',c.headline,
      'body',c.body,
      'cta_label',c.cta_label,
      'destination_url',c.destination_url,
      'target_location_id',c.target_location_id,
      'business_id',c.business_id
    ) as item,
    c.owner_priority,
    (
      case when c.targeting='{}'::jsonb then 1 else 0 end
      + case when c.targeting ? 'coarse_region' and c.targeting->>'coarse_region'=p_context->>'coarse_region' then 8 else 0 end
      + case when c.targeting ? 'route_context' and c.targeting->>'route_context'=p_context->>'route_context' then 6 else 0 end
      + case when c.targeting ? 'time_bucket' and c.targeting->>'time_bucket'=p_context->>'time_bucket' then 3 else 0 end
      + case when c.targeting ? 'amenities' and exists (
          select 1
          from jsonb_array_elements_text(coalesce(c.targeting->'amenities','[]'::jsonb)) a
          join jsonb_array_elements_text(coalesce(p_context->'amenities','[]'::jsonb)) b on a.value=b.value
        ) then 5 else 0 end
      + case when c.targeting ? 'broad_interests' and exists (
          select 1
          from jsonb_array_elements_text(coalesce(c.targeting->'broad_interests','[]'::jsonb)) a
          join jsonb_array_elements_text(coalesce(p_context->'broad_interests','[]'::jsonb)) b on a.value=b.value
        ) then 4 else 0 end
    ) as score
    from public.sponsored_campaigns c
    join public.sponsored_campaign_placements cp on cp.campaign_id=c.id
    join public.ad_placements p on p.placement_code=cp.placement_code
    where p.surface=p_surface
      and p.active=true and p.owner_enabled=true
      and c.status='active'
      and (c.starts_at is null or c.starts_at<=now())
      and (c.ends_at is null or c.ends_at>now())
      and (
        v_user is null
        or (
          select count(*)
          from public.sponsored_events e
          where e.user_id=v_user and e.campaign_id=c.id and e.event_type='impression'
            and e.created_at>=date_trunc('day',now())
        ) < least(c.frequency_cap_daily,p.frequency_cap_daily)
      )
      and (
        c.impression_cap_total is null
        or (
          select count(*) from public.sponsored_events e
          where e.campaign_id=c.id and e.event_type='impression'
        ) < c.impression_cap_total
      )
    order by score desc,c.owner_priority desc
    limit 3
  ) ranked;

  return coalesce(v_result,'[]'::jsonb);
end;
$$;
revoke all on function public.consumer_sponsored_cards(text,jsonb) from public;
grant execute on function public.consumer_sponsored_cards(text,jsonb) to anon,authenticated;

create or replace function public.business_sponsorship_snapshot(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required' using errcode='42501'; end if;

  select jsonb_build_object(
    'placements',coalesce((
      select jsonb_agg(jsonb_build_object(
        'placement_code',a.placement_code,
        'surface',a.surface,
        'slot',a.slot,
        'format',a.format,
        'frequency_cap_daily',a.frequency_cap_daily
      ) order by a.priority desc,a.placement_code)
      from public.ad_placements a
      where a.active=true and a.owner_enabled=true
        and position('hero' in lower(a.placement_code))=0
        and position('hero' in lower(a.slot))=0
    ),'[]'::jsonb),
    'campaigns',coalesce((
      select jsonb_agg(
        to_jsonb(c) || jsonb_build_object(
          'placements',coalesce((select jsonb_agg(cp.placement_code order by cp.placement_code) from public.sponsored_campaign_placements cp where cp.campaign_id=c.id),'[]'::jsonb),
          'impressions',(select count(*) from public.sponsored_events e where e.campaign_id=c.id and e.event_type='impression'),
          'clicks',(select count(*) from public.sponsored_events e where e.campaign_id=c.id and e.event_type='click'),
          'dismissals',(select count(*) from public.sponsored_events e where e.campaign_id=c.id and e.event_type='dismiss')
        )
        order by c.updated_at desc
      )
      from public.sponsored_campaigns c
      where c.business_id=p_business_id
    ),'[]'::jsonb),
    'rules',jsonb_build_object(
      'organic_ranking_affected',false,
      'trust_affected',false,
      'remove_ads_applies',false,
      'allowed_targeting_keys',jsonb_build_array('coarse_region','route_context','amenities','time_bucket','broad_interests'),
      'activation_requires_approval',true
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.business_sponsorship_snapshot(uuid) from public,anon;
grant execute on function public.business_sponsorship_snapshot(uuid) to authenticated,service_role;

create or replace function public.business_upsert_sponsored_campaign(
  p_business_id uuid,
  p_campaign_id uuid,
  p_name text,
  p_headline text,
  p_body text,
  p_cta_label text,
  p_destination_url text,
  p_targeting jsonb,
  p_frequency_cap_daily integer,
  p_impression_cap_total bigint,
  p_placement_codes text[],
  p_submit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid := coalesce(p_campaign_id,gen_random_uuid());
  v_business_name text;
  v_bad_key text;
  v_existing public.sponsored_campaigns;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required' using errcode='42501'; end if;

  select b.name into v_business_name from public.businesses b where b.id=p_business_id;
  if coalesce(trim(v_business_name),'')='' then raise exception 'Business profile name is required'; end if;
  if coalesce(trim(p_name),'')='' or coalesce(trim(p_headline),'')='' then raise exception 'Campaign name and headline are required'; end if;
  if coalesce(trim(p_destination_url),'') !~* '^https://' then raise exception 'Destination URL must use HTTPS'; end if;

  select key into v_bad_key
  from jsonb_object_keys(coalesce(p_targeting,'{}'::jsonb)) key
  where key not in ('coarse_region','route_context','amenities','time_bucket','broad_interests')
  limit 1;
  if v_bad_key is not null then raise exception 'Unsupported targeting key: %',v_bad_key using errcode='22023'; end if;

  if exists (
    select 1
    from unnest(coalesce(p_placement_codes,array[]::text[])) u(code)
    left join public.ad_placements a on a.placement_code=u.code
    where a.placement_code is null
       or a.active=false
       or a.owner_enabled=false
       or position('hero' in lower(a.placement_code))>0
       or position('hero' in lower(a.slot))>0
  ) then raise exception 'One or more sponsored placements are unavailable'; end if;

  if coalesce(array_length(p_placement_codes,1),0)=0 then raise exception 'Choose at least one placement'; end if;

  select * into v_existing from public.sponsored_campaigns c where c.id=v_id;
  if v_existing.id is not null and v_existing.business_id is distinct from p_business_id then
    raise exception 'Campaign does not belong to this Business' using errcode='42501';
  end if;
  if v_existing.status='active' then
    raise exception 'Live campaigns must be paused by Kleenest before editing';
  end if;

  insert into public.sponsored_campaigns(
    id,business_id,name,sponsor_name,label,headline,body,cta_label,destination_url,status,targeting,
    frequency_cap_daily,impression_cap_total,submission_status,submitted_at,created_by,updated_by,updated_at
  )
  values(
    v_id,p_business_id,trim(p_name),trim(v_business_name),'Sponsored',trim(p_headline),nullif(trim(coalesce(p_body,'')),''),
    coalesce(nullif(trim(p_cta_label),''),'Learn more'),trim(p_destination_url),'draft',coalesce(p_targeting,'{}'::jsonb),
    greatest(1,least(coalesce(p_frequency_cap_daily,2),10)),p_impression_cap_total,
    case when p_submit then 'submitted' else 'draft' end,
    case when p_submit then now() else null end,
    auth.uid(),auth.uid(),now()
  )
  on conflict(id) do update set
    name=excluded.name,
    sponsor_name=excluded.sponsor_name,
    headline=excluded.headline,
    body=excluded.body,
    cta_label=excluded.cta_label,
    destination_url=excluded.destination_url,
    targeting=excluded.targeting,
    frequency_cap_daily=excluded.frequency_cap_daily,
    impression_cap_total=excluded.impression_cap_total,
    submission_status=excluded.submission_status,
    submitted_at=excluded.submitted_at,
    review_note=null,
    reviewed_at=null,
    updated_by=auth.uid(),
    updated_at=now();

  delete from public.sponsored_campaign_placements where campaign_id=v_id;
  insert into public.sponsored_campaign_placements(campaign_id,placement_code)
  select v_id,u.code
  from unnest(p_placement_codes) u(code)
  join public.ad_placements a on a.placement_code=u.code
  where a.active=true and a.owner_enabled=true;

  select to_jsonb(c) || jsonb_build_object(
    'placements',coalesce((select jsonb_agg(cp.placement_code order by cp.placement_code) from public.sponsored_campaign_placements cp where cp.campaign_id=v_id),'[]'::jsonb)
  ) into v_result
  from public.sponsored_campaigns c where c.id=v_id;

  return v_result;
end;
$$;
revoke all on function public.business_upsert_sponsored_campaign(uuid,uuid,text,text,text,text,text,jsonb,integer,bigint,text[],boolean) from public,anon;
grant execute on function public.business_upsert_sponsored_campaign(uuid,uuid,text,text,text,text,text,jsonb,integer,bigint,text[],boolean) to authenticated,service_role;

create or replace function public.business_withdraw_sponsored_campaign(
  p_business_id uuid,
  p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required' using errcode='42501'; end if;

  update public.sponsored_campaigns c
     set status=case when c.status='active' then 'paused' else c.status end,
         submission_status='withdrawn',
         updated_by=auth.uid(),
         updated_at=now()
   where c.id=p_campaign_id and c.business_id=p_business_id
   returning to_jsonb(c) into v_result;

  if v_result is null then raise exception 'Campaign not found'; end if;
  return v_result;
end;
$$;
revoke all on function public.business_withdraw_sponsored_campaign(uuid,uuid) from public,anon;
grant execute on function public.business_withdraw_sponsored_campaign(uuid,uuid) to authenticated,service_role;

create or replace function public.owner_relevance_sponsorship_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare v_result jsonb;
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'hero_policies',coalesce((select jsonb_agg(to_jsonb(p) order by p.surface_code) from public.organic_hero_policies p),'[]'::jsonb),
    'placements',coalesce((select jsonb_agg(to_jsonb(a) order by a.surface,a.priority desc) from public.ad_placements a),'[]'::jsonb),
    'campaigns',coalesce((
      select jsonb_agg(
        to_jsonb(c) || jsonb_build_object(
          'placements',coalesce((select jsonb_agg(cp.placement_code) from public.sponsored_campaign_placements cp where cp.campaign_id=c.id),'[]'::jsonb),
          'impressions',(select count(*) from public.sponsored_events e where e.campaign_id=c.id and e.event_type='impression'),
          'clicks',(select count(*) from public.sponsored_events e where e.campaign_id=c.id and e.event_type='click')
        )
        order by c.updated_at desc
      )
      from public.sponsored_campaigns c
    ),'[]'::jsonb),
    'rules',jsonb_build_object(
      'hero_is_organic_only',true,
      'paid_can_change_trust',false,
      'sensitive_targeting_allowed',false,
      'allowed_targeting_keys',jsonb_build_array('coarse_region','route_context','amenities','time_bucket','broad_interests'),
      'premium_removes_sponsored',false,
      'remove_ads_scope','network_only'
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.owner_relevance_sponsorship_snapshot() from public;
grant execute on function public.owner_relevance_sponsorship_snapshot() to authenticated;

comment on function public.consumer_network_ads_enabled(uuid) is
  '$5 Remove Ads / Premium suppresses third-party network inventory such as AdMob. It does not suppress direct Kleenest Sponsored workflow recommendations.';
comment on function public.consumer_sponsored_cards(text,jsonb) is
  'Returns contextual direct Kleenest Sponsored cards independently of the network-ad removal entitlement. Sponsored content never changes organic trust/freshness/ranking.';
comment on function public.business_sponsorship_snapshot(uuid) is
  'Business-scoped self-service sponsorship inventory, campaign status and performance.';
