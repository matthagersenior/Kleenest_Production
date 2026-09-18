create table if not exists public.qr_redemptions (id uuid primary key default gen_random_uuid(), qr_code_id uuid not null references public.qr_codes(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, check_in_id uuid references public.check_ins(id) on delete set null, redeemed_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb);
create index if not exists qr_redemptions_qr_idx on public.qr_redemptions(qr_code_id,redeemed_at desc);
create index if not exists qr_redemptions_user_idx on public.qr_redemptions(user_id,redeemed_at desc);
alter table public.qr_redemptions enable row level security;
drop policy if exists qr_redemptions_own on public.qr_redemptions;
create policy qr_redemptions_own on public.qr_redemptions for select to authenticated using(user_id=auth.uid());

create or replace function public.create_business_qr(p_location_id uuid,p_label text default 'Check-in',p_purpose text default 'check_in',p_action_type text default 'check_in',p_single_use boolean default false,p_max_redemptions integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); b uuid; q uuid; c text;
begin
 if u is null then raise exception 'Authentication required'; end if;
 select business_id into b from public.locations where id=p_location_id and is_active=true;
 if b is null then raise exception 'Location not found'; end if;
 if not exists(select 1 from public.business_members where business_id=b and user_id=u and role in ('owner','admin','manager')) then raise exception 'Business authorization required'; end if;
 c:='K'+upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));
 insert into public.qr_codes(location_id,code,active,label,purpose,action_type,single_use,max_redemptions,business_id,customization,action_payload) values(p_location_id,c,true,coalesce(nullif(trim(p_label),''),'Check-in'),p_purpose,p_action_type,p_single_use,p_max_redemptions,b,'{}'::jsonb,jsonb_build_object('route','check-in')) returning id into q;
 return jsonb_build_object('id',q,'code',c,'location_id',p_location_id);
end $$;
revoke all on function public.create_business_qr(uuid,text,text,text,boolean,integer) from public;
grant execute on function public.create_business_qr(uuid,text,text,text,boolean,integer) to authenticated;

create or replace function public.redeem_qr_code(p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); q record; r integer; ci jsonb;
begin
 if u is null then raise exception 'Authentication required'; end if;
 select * into q from public.qr_codes where code=trim(p_code) and active=true limit 1;
 if q.id is null then raise exception 'Invalid or inactive QR code'; end if;
 select count(*) into r from public.qr_redemptions where qr_code_id=q.id;
 if q.max_redemptions is not null and r>=q.max_redemptions then raise exception 'QR redemption limit reached'; end if;
 if q.single_use and exists(select 1 from public.qr_redemptions where qr_code_id=q.id and user_id=u) then return jsonb_build_object('ok',true,'already_redeemed',true,'qr_code_id',q.id); end if;
 ci:=public.create_check_in((select id from public.places where location_id=q.location_id and is_active=true limit 1),q.code);
 insert into public.qr_redemptions(qr_code_id,user_id,check_in_id,metadata) values(q.id,u,(ci->>'check_in_id')::uuid,jsonb_build_object('action_type',q.action_type));
 return ci || jsonb_build_object('qr_code_id',q.id,'redeemed',true);
end $$;
revoke all on function public.redeem_qr_code(text) from public;
grant execute on function public.redeem_qr_code(text) to authenticated;

create or replace function public.set_qr_active(p_qr_id uuid,p_active boolean)
returns boolean language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); b uuid;
begin
 select business_id into b from public.qr_codes where id=p_qr_id;
 if b is null then raise exception 'QR code not found'; end if;
 if not exists(select 1 from public.business_members where business_id=b and user_id=u and role in ('owner','admin','manager')) then raise exception 'Business authorization required'; end if;
 update public.qr_codes set active=p_active where id=p_qr_id; return true;
end $$;
revoke all on function public.set_qr_active(uuid,boolean) from public;
grant execute on function public.set_qr_active(uuid,boolean) to authenticated;
