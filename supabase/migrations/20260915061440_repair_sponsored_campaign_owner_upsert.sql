create or replace function public.owner_upsert_sponsored_campaign(
  p_campaign_id uuid,
  p_name text,
  p_sponsor_name text,
  p_headline text,
  p_body text,
  p_cta_label text,
  p_destination_url text,
  p_target_location_id uuid,
  p_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_targeting jsonb,
  p_frequency_cap_daily integer,
  p_impression_cap_total bigint,
  p_owner_priority integer,
  p_placement_codes text[],
  p_reason text default 'KleenestOS sponsored campaign update'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid := coalesce(p_campaign_id,gen_random_uuid());
  v_before jsonb;
  v_after jsonb;
  v_bad_key text;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  if p_status not in ('draft','active','paused','ended') then raise exception 'invalid campaign status' using errcode='22023'; end if;

  select keys.key into v_bad_key
  from jsonb_object_keys(coalesce(p_targeting,'{}'::jsonb)) as keys(key)
  where keys.key not in ('coarse_region','route_context','amenities','time_bucket','broad_interests')
  limit 1;
  if v_bad_key is not null then raise exception 'sensitive or unsupported targeting key: %',v_bad_key using errcode='22023'; end if;

  if exists (
    select 1 from public.ad_placements a
    where a.placement_code=any(coalesce(p_placement_codes,array[]::text[]))
      and (position('hero' in lower(a.placement_code))>0 or position('hero' in lower(a.slot))>0)
  ) then raise exception 'sponsored campaigns cannot use hero placement' using errcode='22023'; end if;

  select to_jsonb(c) into v_before from public.sponsored_campaigns c where c.id=v_id;

  insert into public.sponsored_campaigns(
    id,name,sponsor_name,headline,body,cta_label,destination_url,target_location_id,status,starts_at,ends_at,targeting,
    frequency_cap_daily,impression_cap_total,owner_priority,created_by,updated_by,updated_at
  )
  values(
    v_id,p_name,p_sponsor_name,p_headline,p_body,coalesce(nullif(p_cta_label,''),'Learn more'),p_destination_url,p_target_location_id,p_status,
    p_starts_at,p_ends_at,coalesce(p_targeting,'{}'::jsonb),greatest(1,least(p_frequency_cap_daily,20)),p_impression_cap_total,p_owner_priority,
    auth.uid(),auth.uid(),now()
  )
  on conflict(id) do update set
    name=excluded.name,sponsor_name=excluded.sponsor_name,headline=excluded.headline,body=excluded.body,cta_label=excluded.cta_label,
    destination_url=excluded.destination_url,target_location_id=excluded.target_location_id,status=excluded.status,starts_at=excluded.starts_at,
    ends_at=excluded.ends_at,targeting=excluded.targeting,frequency_cap_daily=excluded.frequency_cap_daily,
    impression_cap_total=excluded.impression_cap_total,owner_priority=excluded.owner_priority,updated_by=auth.uid(),updated_at=now();

  delete from public.sponsored_campaign_placements where campaign_id=v_id;
  insert into public.sponsored_campaign_placements(campaign_id,placement_code)
  select v_id,u.code
  from unnest(coalesce(p_placement_codes,array[]::text[])) as u(code)
  join public.ad_placements a on a.placement_code=u.code;

  select to_jsonb(c) || jsonb_build_object(
    'placements',
    coalesce((select jsonb_agg(cp.placement_code) from public.sponsored_campaign_placements cp where cp.campaign_id=v_id),'[]'::jsonb)
  )
  into v_after
  from public.sponsored_campaigns c
  where c.id=v_id;

  insert into public.relevance_sponsorship_audit(actor_user_id,action,entity_type,entity_key,previous_state,next_state,reason)
  values(auth.uid(),'upsert','sponsored_campaign',v_id::text,v_before,v_after,p_reason);
  return v_after;
end;
$$;
revoke all on function public.owner_upsert_sponsored_campaign(uuid,text,text,text,text,text,text,uuid,text,timestamptz,timestamptz,jsonb,integer,bigint,integer,text[],text) from public;
grant execute on function public.owner_upsert_sponsored_campaign(uuid,text,text,text,text,text,text,uuid,text,timestamptz,timestamptz,jsonb,integer,bigint,integer,text[],text) to authenticated;
