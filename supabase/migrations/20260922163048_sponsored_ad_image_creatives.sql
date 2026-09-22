-- Sponsored creative images for Kleenest direct sponsorship.
-- Adds accessible image-capable creatives while preserving trust/relevance boundaries.

alter table public.sponsored_campaigns
  add column if not exists creative_mode text not null default 'text_only',
  add column if not exists image_url text,
  add column if not exists image_alt text,
  add column if not exists logo_url text;

alter table public.sponsored_campaigns drop constraint if exists sponsored_campaigns_creative_mode_check;
alter table public.sponsored_campaigns add constraint sponsored_campaigns_creative_mode_check
  check (creative_mode in ('text_only','image_text','image_only'));

alter table public.sponsored_campaigns drop constraint if exists sponsored_campaigns_image_url_https_check;
alter table public.sponsored_campaigns add constraint sponsored_campaigns_image_url_https_check
  check (image_url is null or image_url ~* '^https://');

alter table public.sponsored_campaigns drop constraint if exists sponsored_campaigns_logo_url_https_check;
alter table public.sponsored_campaigns add constraint sponsored_campaigns_logo_url_https_check
  check (logo_url is null or logo_url ~* '^https://');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('sponsored-ad-creatives','sponsored-ad-creatives',true,5242880,array['image/jpeg','image/png','image/webp']::text[])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists sponsored_creatives_insert on storage.objects;
create policy sponsored_creatives_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='sponsored-ad-creatives' and (
    (coalesce((storage.foldername(name))[1],'')='owner' and public.is_platform_owner_session())
    or (
      coalesce((storage.foldername(name))[1],'')='business'
      and case
        when coalesce((storage.foldername(name))[2],'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then public.business_can_manage(((storage.foldername(name))[2])::uuid)
        else false
      end
    )
  )
);

drop policy if exists sponsored_creatives_update on storage.objects;
create policy sponsored_creatives_update on storage.objects
for update to authenticated
using (
  bucket_id='sponsored-ad-creatives' and (
    public.is_platform_owner_session()
    or (
      coalesce((storage.foldername(name))[1],'')='business'
      and case
        when coalesce((storage.foldername(name))[2],'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then public.business_can_manage(((storage.foldername(name))[2])::uuid)
        else false
      end
    )
  )
)
with check (
  bucket_id='sponsored-ad-creatives' and (
    public.is_platform_owner_session()
    or (
      coalesce((storage.foldername(name))[1],'')='business'
      and case
        when coalesce((storage.foldername(name))[2],'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then public.business_can_manage(((storage.foldername(name))[2])::uuid)
        else false
      end
    )
  )
);

drop policy if exists sponsored_creatives_delete on storage.objects;
create policy sponsored_creatives_delete on storage.objects
for delete to authenticated
using (
  bucket_id='sponsored-ad-creatives' and (
    public.is_platform_owner_session()
    or (
      coalesce((storage.foldername(name))[1],'')='business'
      and case
        when coalesce((storage.foldername(name))[2],'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then public.business_can_manage(((storage.foldername(name))[2])::uuid)
        else false
      end
    )
  )
);

drop function if exists public.owner_upsert_sponsored_campaign(uuid,text,text,text,text,text,text,uuid,text,timestamptz,timestamptz,jsonb,integer,bigint,integer,text[],text);
create function public.owner_upsert_sponsored_campaign(
  p_campaign_id uuid,p_name text,p_sponsor_name text,p_headline text,p_body text,p_cta_label text,p_destination_url text,
  p_target_location_id uuid,p_status text,p_starts_at timestamptz,p_ends_at timestamptz,p_targeting jsonb,
  p_frequency_cap_daily integer,p_impression_cap_total bigint,p_owner_priority integer,p_placement_codes text[],
  p_creative_mode text default 'text_only',p_image_url text default null,p_image_alt text default null,p_logo_url text default null,
  p_reason text default 'KleenestOS sponsored campaign update'
)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare
  v_id uuid:=coalesce(p_campaign_id,gen_random_uuid()); v_before jsonb; v_after jsonb; v_bad_key text;
  v_mode text:=coalesce(nullif(trim(p_creative_mode),''),'text_only');
  v_image text:=nullif(trim(coalesce(p_image_url,'')),''); v_alt text:=nullif(trim(coalesce(p_image_alt,'')),'');
  v_logo text:=nullif(trim(coalesce(p_logo_url,'')),'');
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  if p_status not in ('draft','active','paused','ended') then raise exception 'invalid campaign status' using errcode='22023'; end if;
  if coalesce(trim(p_destination_url),'') !~* '^https://' then raise exception 'Destination URL must use HTTPS'; end if;
  if v_mode not in ('text_only','image_text','image_only') then raise exception 'invalid creative mode' using errcode='22023'; end if;
  if v_image is not null and v_image !~* '^https://' then raise exception 'Creative image URL must use HTTPS'; end if;
  if v_logo is not null and v_logo !~* '^https://' then raise exception 'Logo URL must use HTTPS'; end if;
  if v_mode <> 'text_only' and v_image is null then raise exception 'Image creative modes require an image'; end if;
  if v_image is not null and v_alt is null then raise exception 'Image alt text is required for accessible sponsored creatives'; end if;
  if length(coalesce(v_alt,''))>220 then raise exception 'Image alt text must be 220 characters or fewer'; end if;

  select keys.key into v_bad_key from jsonb_object_keys(coalesce(p_targeting,'{}'::jsonb)) as keys(key)
  where keys.key not in ('coarse_region','route_context','amenities','time_bucket','broad_interests') limit 1;
  if v_bad_key is not null then raise exception 'sensitive or unsupported targeting key: %',v_bad_key using errcode='22023'; end if;

  if exists(select 1 from public.ad_placements a where a.placement_code=any(coalesce(p_placement_codes,array[]::text[]))
    and (position('hero' in lower(a.placement_code))>0 or position('hero' in lower(a.slot))>0))
  then raise exception 'sponsored campaigns cannot use hero placement' using errcode='22023'; end if;

  select to_jsonb(c) into v_before from public.sponsored_campaigns c where c.id=v_id;
  insert into public.sponsored_campaigns(
    id,name,sponsor_name,headline,body,cta_label,destination_url,target_location_id,status,starts_at,ends_at,targeting,
    frequency_cap_daily,impression_cap_total,owner_priority,creative_mode,image_url,image_alt,logo_url,created_by,updated_by,updated_at
  ) values(
    v_id,p_name,p_sponsor_name,p_headline,p_body,coalesce(nullif(p_cta_label,''),'Learn more'),p_destination_url,p_target_location_id,p_status,
    p_starts_at,p_ends_at,coalesce(p_targeting,'{}'::jsonb),greatest(1,least(p_frequency_cap_daily,20)),p_impression_cap_total,p_owner_priority,
    v_mode,v_image,v_alt,v_logo,auth.uid(),auth.uid(),now()
  )
  on conflict(id) do update set
    name=excluded.name,sponsor_name=excluded.sponsor_name,headline=excluded.headline,body=excluded.body,cta_label=excluded.cta_label,
    destination_url=excluded.destination_url,target_location_id=excluded.target_location_id,status=excluded.status,starts_at=excluded.starts_at,
    ends_at=excluded.ends_at,targeting=excluded.targeting,frequency_cap_daily=excluded.frequency_cap_daily,
    impression_cap_total=excluded.impression_cap_total,owner_priority=excluded.owner_priority,creative_mode=excluded.creative_mode,
    image_url=excluded.image_url,image_alt=excluded.image_alt,logo_url=excluded.logo_url,updated_by=auth.uid(),updated_at=now();

  delete from public.sponsored_campaign_placements where campaign_id=v_id;
  insert into public.sponsored_campaign_placements(campaign_id,placement_code)
  select v_id,u.code from unnest(coalesce(p_placement_codes,array[]::text[])) as u(code)
  join public.ad_placements a on a.placement_code=u.code;

  select to_jsonb(c)||jsonb_build_object('placements',coalesce((select jsonb_agg(cp.placement_code)
    from public.sponsored_campaign_placements cp where cp.campaign_id=v_id),'[]'::jsonb))
  into v_after from public.sponsored_campaigns c where c.id=v_id;
  insert into public.relevance_sponsorship_audit(actor_user_id,action,entity_type,entity_key,previous_state,next_state,reason)
  values(auth.uid(),'upsert','sponsored_campaign',v_id::text,v_before,v_after,p_reason);
  return v_after;
end;
$$;
revoke all on function public.owner_upsert_sponsored_campaign(uuid,text,text,text,text,text,text,uuid,text,timestamptz,timestamptz,jsonb,integer,bigint,integer,text[],text,text,text,text,text) from public;
grant execute on function public.owner_upsert_sponsored_campaign(uuid,text,text,text,text,text,text,uuid,text,timestamptz,timestamptz,jsonb,integer,bigint,integer,text[],text,text,text,text,text) to authenticated;

drop function if exists public.business_upsert_sponsored_campaign(uuid,uuid,text,text,text,text,text,jsonb,integer,bigint,text[],boolean);
create function public.business_upsert_sponsored_campaign(
  p_business_id uuid,p_campaign_id uuid,p_name text,p_headline text,p_body text,p_cta_label text,p_destination_url text,
  p_targeting jsonb,p_frequency_cap_daily integer,p_impression_cap_total bigint,p_placement_codes text[],p_submit boolean default false,
  p_creative_mode text default 'text_only',p_image_url text default null,p_image_alt text default null,p_logo_url text default null
)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare
  v_id uuid:=coalesce(p_campaign_id,gen_random_uuid()); v_business_name text; v_bad_key text;
  v_existing public.sponsored_campaigns; v_result jsonb; v_mode text:=coalesce(nullif(trim(p_creative_mode),''),'text_only');
  v_image text:=nullif(trim(coalesce(p_image_url,'')),''); v_alt text:=nullif(trim(coalesce(p_image_alt,'')),'');
  v_logo text:=nullif(trim(coalesce(p_logo_url,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required' using errcode='42501'; end if;
  select b.name into v_business_name from public.businesses b where b.id=p_business_id;
  if coalesce(trim(v_business_name),'')='' then raise exception 'Business profile name is required'; end if;
  if coalesce(trim(p_name),'')='' or coalesce(trim(p_headline),'')='' then raise exception 'Campaign name and headline are required'; end if;
  if coalesce(trim(p_destination_url),'') !~* '^https://' then raise exception 'Destination URL must use HTTPS'; end if;
  if v_mode not in ('text_only','image_text','image_only') then raise exception 'invalid creative mode' using errcode='22023'; end if;
  if v_image is not null and v_image !~* '^https://' then raise exception 'Creative image URL must use HTTPS'; end if;
  if v_logo is not null and v_logo !~* '^https://' then raise exception 'Logo URL must use HTTPS'; end if;
  if v_mode <> 'text_only' and v_image is null then raise exception 'Image creative modes require an image'; end if;
  if v_image is not null and v_alt is null then raise exception 'Image alt text is required for accessible sponsored creatives'; end if;
  if length(coalesce(v_alt,''))>220 then raise exception 'Image alt text must be 220 characters or fewer'; end if;

  select key into v_bad_key from jsonb_object_keys(coalesce(p_targeting,'{}'::jsonb)) key
  where key not in ('coarse_region','route_context','amenities','time_bucket','broad_interests') limit 1;
  if v_bad_key is not null then raise exception 'Unsupported targeting key: %',v_bad_key using errcode='22023'; end if;

  if exists(select 1 from unnest(coalesce(p_placement_codes,array[]::text[])) u(code)
    left join public.ad_placements a on a.placement_code=u.code
    where a.placement_code is null or a.active=false or a.owner_enabled=false
      or position('hero' in lower(a.placement_code))>0 or position('hero' in lower(a.slot))>0)
  then raise exception 'One or more sponsored placements are unavailable'; end if;
  if coalesce(array_length(p_placement_codes,1),0)=0 then raise exception 'Choose at least one placement'; end if;

  select * into v_existing from public.sponsored_campaigns c where c.id=v_id;
  if v_existing.id is not null and v_existing.business_id is distinct from p_business_id
    then raise exception 'Campaign does not belong to this Business' using errcode='42501'; end if;
  if v_existing.status='active' then raise exception 'Live campaigns must be paused by Kleenest before editing'; end if;

  insert into public.sponsored_campaigns(
    id,business_id,name,sponsor_name,label,headline,body,cta_label,destination_url,status,targeting,
    frequency_cap_daily,impression_cap_total,submission_status,submitted_at,creative_mode,image_url,image_alt,logo_url,
    created_by,updated_by,updated_at
  ) values(
    v_id,p_business_id,trim(p_name),trim(v_business_name),'Sponsored',trim(p_headline),nullif(trim(coalesce(p_body,'')),''),
    coalesce(nullif(trim(p_cta_label),''),'Learn more'),trim(p_destination_url),'draft',coalesce(p_targeting,'{}'::jsonb),
    greatest(1,least(coalesce(p_frequency_cap_daily,2),10)),p_impression_cap_total,
    case when p_submit then 'submitted' else 'draft' end,case when p_submit then now() else null end,
    v_mode,v_image,v_alt,v_logo,auth.uid(),auth.uid(),now()
  )
  on conflict(id) do update set
    name=excluded.name,sponsor_name=excluded.sponsor_name,headline=excluded.headline,body=excluded.body,cta_label=excluded.cta_label,
    destination_url=excluded.destination_url,targeting=excluded.targeting,frequency_cap_daily=excluded.frequency_cap_daily,
    impression_cap_total=excluded.impression_cap_total,submission_status=excluded.submission_status,submitted_at=excluded.submitted_at,
    creative_mode=excluded.creative_mode,image_url=excluded.image_url,image_alt=excluded.image_alt,logo_url=excluded.logo_url,
    review_note=null,reviewed_at=null,updated_by=auth.uid(),updated_at=now();

  delete from public.sponsored_campaign_placements where campaign_id=v_id;
  insert into public.sponsored_campaign_placements(campaign_id,placement_code)
  select v_id,u.code from unnest(p_placement_codes) u(code)
  join public.ad_placements a on a.placement_code=u.code where a.active=true and a.owner_enabled=true;

  select to_jsonb(c)||jsonb_build_object('placements',coalesce((select jsonb_agg(cp.placement_code order by cp.placement_code)
    from public.sponsored_campaign_placements cp where cp.campaign_id=v_id),'[]'::jsonb))
  into v_result from public.sponsored_campaigns c where c.id=v_id;
  return v_result;
end;
$$;
revoke all on function public.business_upsert_sponsored_campaign(uuid,uuid,text,text,text,text,text,jsonb,integer,bigint,text[],boolean,text,text,text,text) from public,anon;
grant execute on function public.business_upsert_sponsored_campaign(uuid,uuid,text,text,text,text,text,jsonb,integer,bigint,text[],boolean,text,text,text,text) to authenticated,service_role;

create or replace function public.consumer_sponsored_cards(p_surface text,p_context jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare v_user uuid:=auth.uid(); v_result jsonb;
begin
  select coalesce(jsonb_agg(item order by score desc,owner_priority desc),'[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'campaign_id',c.id,'placement_code',p.placement_code,'label',c.label,'sponsor_name',c.sponsor_name,
      'headline',c.headline,'body',c.body,'cta_label',c.cta_label,'destination_url',c.destination_url,
      'target_location_id',c.target_location_id,'business_id',c.business_id,'creative_mode',c.creative_mode,
      'image_url',c.image_url,'image_alt',c.image_alt,'logo_url',c.logo_url
    ) as item,c.owner_priority,
    (
      case when c.targeting='{}'::jsonb then 1 else 0 end
      + case when c.targeting?'coarse_region' and c.targeting->>'coarse_region'=p_context->>'coarse_region' then 8 else 0 end
      + case when c.targeting?'route_context' and c.targeting->>'route_context'=p_context->>'route_context' then 6 else 0 end
      + case when c.targeting?'time_bucket' and c.targeting->>'time_bucket'=p_context->>'time_bucket' then 3 else 0 end
      + case when c.targeting?'amenities' and exists(select 1 from jsonb_array_elements_text(coalesce(c.targeting->'amenities','[]'::jsonb)) a
        join jsonb_array_elements_text(coalesce(p_context->'amenities','[]'::jsonb)) b on a.value=b.value) then 5 else 0 end
      + case when c.targeting?'broad_interests' and exists(select 1 from jsonb_array_elements_text(coalesce(c.targeting->'broad_interests','[]'::jsonb)) a
        join jsonb_array_elements_text(coalesce(p_context->'broad_interests','[]'::jsonb)) b on a.value=b.value) then 4 else 0 end
    ) as score
    from public.sponsored_campaigns c join public.sponsored_campaign_placements cp on cp.campaign_id=c.id
    join public.ad_placements p on p.placement_code=cp.placement_code
    where p.surface=p_surface and p.active=true and p.owner_enabled=true and c.status='active'
      and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>now())
      and (v_user is null or (select count(*) from public.sponsored_events e
        where e.user_id=v_user and e.campaign_id=c.id and e.event_type='impression' and e.created_at>=date_trunc('day',now()))
        < least(c.frequency_cap_daily,p.frequency_cap_daily))
      and (c.impression_cap_total is null or (select count(*) from public.sponsored_events e
        where e.campaign_id=c.id and e.event_type='impression')<c.impression_cap_total)
    order by score desc,c.owner_priority desc limit 3
  ) ranked;
  return coalesce(v_result,'[]'::jsonb);
end;
$$;
revoke all on function public.consumer_sponsored_cards(text,jsonb) from public;
grant execute on function public.consumer_sponsored_cards(text,jsonb) to anon,authenticated;

comment on column public.sponsored_campaigns.creative_mode is 'Sponsored rendering mode: text_only, image_text, or image_only.';
comment on column public.sponsored_campaigns.image_url is 'HTTPS sponsored creative image; uploaded assets use sponsored-ad-creatives.';
comment on column public.sponsored_campaigns.image_alt is 'Accessible image description required when an image is present.';
comment on column public.sponsored_campaigns.logo_url is 'Optional HTTPS sponsor logo URL.';
