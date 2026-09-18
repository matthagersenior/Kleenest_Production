-- Comprehensive QR Studio: tier-aware branding, public landing, analytics detail, and storage.
insert into storage.buckets (id,name,public)
values ('qr-branding','qr-branding',true)
on conflict (id) do update set public=true;

create policy "QR branding is publicly readable"
on storage.objects for select
using (bucket_id='qr-branding');

create policy "Business managers can upload QR branding"
on storage.objects for insert to authenticated
with check (
  bucket_id='qr-branding'
  and public.business_can_manage(nullif(split_part(name,'/',1),'')::uuid)
);

create policy "Business managers can update QR branding"
on storage.objects for update to authenticated
using (
  bucket_id='qr-branding'
  and public.business_can_manage(nullif(split_part(name,'/',1),'')::uuid)
)
with check (
  bucket_id='qr-branding'
  and public.business_can_manage(nullif(split_part(name,'/',1),'')::uuid)
);

create policy "Business managers can delete QR branding"
on storage.objects for delete to authenticated
using (
  bucket_id='qr-branding'
  and public.business_can_manage(nullif(split_part(name,'/',1),'')::uuid)
);

create or replace function public.business_create_custom_qr(
  p_business_id uuid,
  p_location_id uuid,
  p_label text,
  p_purpose text default 'checkin',
  p_action_type text default 'checkin',
  p_action_payload jsonb default '{}'::jsonb,
  p_customization jsonb default '{}'::jsonb,
  p_single_use boolean default false,
  p_max_redemptions integer default null
) returns public.qr_codes
language plpgsql security definer
set search_path=public,auth,extensions,pg_temp
as $function$
declare v public.qr_codes; v_tier text; v_branding jsonb;
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  select business_tier::text into v_tier from public.businesses where id=p_business_id;
  if v_tier is null then raise exception 'Business not found'; end if;
  if p_location_id is not null and not exists(select 1 from public.locations l where l.id=p_location_id and l.business_id=p_business_id) then raise exception 'Location does not belong to business'; end if;
  if p_max_redemptions is not null and p_max_redemptions < 1 then raise exception 'Maximum redemptions must be at least 1'; end if;
  if v_tier='standard' then
    v_branding:=jsonb_build_object(
      'brand_mode','kleenest',
      'logo_url',null,
      'logo_storage_path',null,
      'foreground','#10182d',
      'background','#ffffff',
      'frame_label','Scan with Kleenest',
      'cta_label','Get the Kleenest app to rate & review',
      'app_download_url',coalesce(nullif(p_customization->>'app_download_url',''),concat(current_setting('request.headers',true)::jsonb->>'origin','/')),
      'review_prompt',true,
      'custom_logo_locked',true
    );
  else
    v_branding:=coalesce(p_customization,'{}'::jsonb)||jsonb_build_object('brand_mode',coalesce(p_customization->>'brand_mode','custom'),'custom_logo_locked',false);
  end if;
  insert into public.qr_codes(business_id,location_id,code,label,active,customization,purpose,action_type,action_payload,single_use,max_redemptions)
  values(p_business_id,p_location_id,encode(gen_random_bytes(12),'hex'),nullif(trim(p_label),''),true,v_branding,coalesce(nullif(trim(p_purpose),''),'custom'),coalesce(nullif(trim(p_action_type),''),'custom'),coalesce(p_action_payload,'{}'::jsonb),coalesce(p_single_use,false),case when coalesce(p_single_use,false) then p_max_redemptions else null end)
  returning * into v;
  return v;
end;$function$;

create or replace function public.business_update_custom_qr(
  p_business_id uuid,p_qr_id uuid,p_label text,p_purpose text,p_action_type text,p_action_payload jsonb,p_customization jsonb,p_active boolean default true,p_single_use boolean default false,p_max_redemptions integer default null
) returns public.qr_codes
language plpgsql security definer
set search_path=public,auth,extensions,pg_temp
as $function$
declare v public.qr_codes; v_tier text; v_old jsonb;
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  select business_tier::text into v_tier from public.businesses where id=p_business_id;
  if v_tier is null then raise exception 'Business not found'; end if;
  if p_max_redemptions is not null and p_max_redemptions<1 then raise exception 'Maximum redemptions must be at least 1'; end if;
  select customization into v_old from public.qr_codes where id=p_qr_id and business_id=p_business_id;
  if v_old is null then raise exception 'QR code not found'; end if;
  update public.qr_codes q set
    label=nullif(trim(p_label),''),purpose=coalesce(nullif(trim(p_purpose),''),'custom'),action_type=coalesce(nullif(trim(p_action_type),''),'custom'),action_payload=coalesce(p_action_payload,'{}'::jsonb),
    customization=case when v_tier='standard' then coalesce(v_old,'{}'::jsonb)||jsonb_build_object('brand_mode','kleenest','custom_logo_locked',true) else coalesce(p_customization,'{}'::jsonb)||jsonb_build_object('custom_logo_locked',false) end,
    active=p_active,single_use=coalesce(p_single_use,false),max_redemptions=case when coalesce(p_single_use,false) then p_max_redemptions else null end
  where q.id=p_qr_id and q.business_id=p_business_id returning q.* into v;
  if v.id is null then raise exception 'QR code not found'; end if;
  return v;
end;$function$;

create or replace function public.business_qr_detail(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now()) returns jsonb
language plpgsql security definer
set search_path=public,auth,extensions,pg_temp
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) and not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role='analyst') and not public.is_platform_owner_session() then raise exception 'Not authorized for this business'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.check_ins desc,x.label) from (
    select q.id,q.code,q.label,q.active,q.customization,q.purpose,q.action_type,q.action_payload,q.single_use,q.max_redemptions,
      l.id location_id,l.name location_name,
      count(ci.id) filter(where ci.checked_in_at between p_start and p_end) check_ins,
      count(distinct ci.user_id) filter(where ci.checked_in_at between p_start and p_end) unique_users,
      (select count(*) from public.qr_attribution_events ae where ae.qr_code_id=q.id and ae.created_at between p_start and p_end) scans,
      (select count(*) from public.qr_redemptions r where r.qr_code_id=q.id and r.redeemed_at between p_start and p_end) redemptions,
      max(ci.checked_in_at) last_check_in,
      (select count(*) from public.qr_engagement_programs ep where ep.qr_code_id=q.id) engagement_programs
    from public.qr_codes q join public.locations l on l.id=q.location_id
    left join public.check_ins ci on ci.qr_code_id=q.id
    where q.business_id=p_business_id group by q.id,l.id
  ) x),'[]'::jsonb);
end;$function$;

create or replace function public.get_public_qr_landing(p_qr_code text) returns jsonb
language plpgsql security definer
set search_path=public,auth,extensions,pg_temp
as $function$
declare q public.qr_codes; b public.businesses; l public.locations; v jsonb;
begin
  select * into q from public.qr_codes where code=trim(p_qr_code) and active=true limit 1;
  if not found then raise exception 'Invalid or inactive Kleenest QR'; end if;
  select * into b from public.businesses where id=q.business_id;
  select * into l from public.locations where id=q.location_id and is_active=true;
  if not found then raise exception 'QR location unavailable'; end if;
  v:=jsonb_build_object('id',q.id,'code',q.code,'business_id',q.business_id,'business_name',b.name,'business_logo_url',b.logo_url,'location_id',q.location_id,'location_name',l.name,'address',l.address,'label',q.label,'purpose',q.purpose,'action_type',q.action_type,'action_payload',q.action_payload,'customization',q.customization);
  insert into public.qr_attribution_events(qr_code_id,location_id,business_id,user_id,action_type,source,metadata)
  values(q.id,q.location_id,q.business_id,auth.uid(),'scan','public_qr_landing',jsonb_build_object('anonymous',auth.uid() is null));
  return v;
end;$function$;

grant execute on function public.get_public_qr_landing(text) to anon,authenticated;
revoke execute on function public.business_create_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean,integer) from anon;
revoke execute on function public.business_update_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean,boolean,integer) from anon;
