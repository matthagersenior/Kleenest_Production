alter table public.qr_codes add column if not exists label text not null default 'Scan to Check In'; alter table public.qr_codes add column if not exists customization jsonb not null default '{}'::jsonb;

create or replace function public.ensure_location_qr(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_qr public.qr_codes%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.locations l
    left join public.business_members bm on bm.business_id=l.business_id and bm.user_id=auth.uid()
    left join public.profiles p on p.id=auth.uid()
    where l.id=p_location_id and l.is_active=true
      and (coalesce(p.is_admin,false) or bm.role::text in ('owner','admin','manager'))
  ) then raise exception 'not authorized for this location'; end if;
  select * into v_qr from public.qr_codes where location_id=p_location_id and active=true order by created_at desc limit 1;
  if not found then
    insert into public.qr_codes(location_id,code,active,label,customization)
    values(p_location_id,'KLEENEST-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),true,'Scan to Check In','{}'::jsonb)
    returning * into v_qr;
  end if;
  return to_jsonb(v_qr);
end;
$$;

grant execute on function public.ensure_location_qr(uuid) to authenticated;

create or replace function public.set_location_qr_customization(p_location_id uuid,p_label text,p_customization jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_qr public.qr_codes%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.locations l
    left join public.business_members bm on bm.business_id=l.business_id and bm.user_id=auth.uid()
    left join public.profiles p on p.id=auth.uid()
    where l.id=p_location_id and l.is_active=true
      and (coalesce(p.is_admin,false) or bm.role::text in ('owner','admin','manager'))
  ) then raise exception 'not authorized for this location'; end if;
  if not exists (select 1 from public.business_members bm join public.businesses b on b.id=bm.business_id where bm.user_id=auth.uid() and bm.business_id=(select business_id from public.locations where id=p_location_id) and b.business_tier::text in ('growth','enterprise'))
     and not exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin) then raise exception 'QR customization requires Growth or Enterprise'; end if;
  select * into v_qr from public.qr_codes where location_id=p_location_id and active=true order by created_at desc limit 1;
  if not found then perform public.ensure_location_qr(p_location_id); select * into v_qr from public.qr_codes where location_id=p_location_id and active=true order by created_at desc limit 1; end if;
  update public.qr_codes set label=coalesce(nullif(trim(p_label),''),'Scan to Check In'), customization=coalesce(p_customization,'{}'::jsonb) where id=v_qr.id returning * into v_qr;
  return to_jsonb(v_qr);
end;
$$;

grant execute on function public.set_location_qr_customization(uuid,text,jsonb) to authenticated;

create or replace function public.business_qr_analytics(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_out jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists (select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid()) and not exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin) then raise exception 'not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('location_id',l.id,'location_name',l.name,'qr_scans',coalesce(x.qr_scans,0),'check_ins',coalesce(x.check_ins,0),'last_scan_at',x.last_scan_at) order by l.name),'[]'::jsonb)
  into v_out
  from public.locations l
  left join lateral (select count(*) filter(where ci.verification_method='qr') qr_scans,count(*) check_ins,max(ci.checked_in_at) last_scan_at from public.check_ins ci where ci.location_id=l.id) x on true
  where l.business_id=p_business_id and l.is_active=true;
  return v_out;
end;
$$;

grant execute on function public.business_qr_analytics(uuid) to authenticated;
