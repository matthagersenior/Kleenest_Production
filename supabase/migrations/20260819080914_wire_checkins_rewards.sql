create table if not exists public.reward_transactions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, check_in_id uuid references public.check_ins(id) on delete set null, points integer not null, reason text not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index if not exists reward_transactions_user_created_idx on public.reward_transactions(user_id, created_at desc);
create unique index if not exists check_ins_user_location_recent_uidx on public.check_ins(user_id, location_id, checked_in_at);

create or replace function public.create_check_in(p_place_id uuid, p_qr_token text default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_location uuid; v_check uuid; v_points integer:=10; v_existing integer; v_qr uuid;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 select location_id into v_location from public.places where id=p_place_id and is_active=true;
 if v_location is null then raise exception 'Place not found'; end if;
 if p_qr_token is not null and length(trim(p_qr_token))>0 then
   select id into v_qr from public.qr_codes where code=trim(p_qr_token) and active=true and location_id=v_location limit 1;
   if v_qr is null then raise exception 'Invalid or inactive QR code'; end if;
 end if;
 select id into v_existing from public.check_ins where user_id=v_user and location_id=v_location and checked_in_at > now()-interval '24 hours' limit 1;
 if v_existing is not null then return jsonb_build_object('ok',true,'already_checked_in',true,'check_in_id',v_existing,'points_awarded',0); end if;
 insert into public.check_ins(user_id,location_id,qr_code_id,checked_in_at,verification_method,points_awarded,metadata) values(v_user,v_location,v_qr,now(),case when v_qr is null then 'place' else 'qr' end,v_points,jsonb_build_object('place_id',p_place_id)) returning id into v_check;
 insert into public.reward_transactions(user_id,check_in_id,points,reason,metadata) values(v_user,v_check,v_points,'check_in',jsonb_build_object('place_id',p_place_id,'qr',v_qr is not null));
 update public.profiles set points=coalesce(points,0)+v_points,total_check_ins=coalesce(total_check_ins,0)+1,level=greatest(1,floor((coalesce(points,0)+v_points)/100)+1)::int,updated_at=now() where id=v_user;
 return jsonb_build_object('ok',true,'already_checked_in',false,'check_in_id',v_check,'points_awarded',v_points);
end $$;
revoke all on function public.create_check_in(uuid,text) from public;
grant execute on function public.create_check_in(uuid,text) to authenticated;

alter table public.reward_transactions enable row level security;
drop policy if exists reward_transactions_select_own on public.reward_transactions;
create policy reward_transactions_select_own on public.reward_transactions for select to authenticated using (user_id=auth.uid());
