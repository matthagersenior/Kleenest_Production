create or replace function public.award_business_progression_perk(p_business_id uuid,p_perk_code text,p_user_id uuid default auth.uid())
returns jsonb language plpgsql security definer set search_path=public,auth,extensions,pg_temp
as $$ declare tier text; inserted_perk boolean:=false; uid uuid:=auth.uid(); begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_user_id is distinct from uid then raise exception 'User identity mismatch'; end if;
 select b.business_tier into tier from public.businesses b join public.business_members bm on bm.business_id=b.id where b.id=p_business_id and bm.user_id=uid and lower(bm.role) in ('owner','admin','manager');
 if tier is null then raise exception 'Business management authorization required'; end if;
 if lower(tier) not in ('growth','enterprise','fleet') then raise exception 'Perk requires Growth or above'; end if;
 insert into public.business_earned_perks(business_id,perk_code) values(p_business_id,p_perk_code) on conflict do nothing;
 inserted_perk:=found;
 if inserted_perk then insert into public.business_progression_events(business_id,user_id,event_code,points,metadata) values(p_business_id,uid,'perk_earned',100,jsonb_build_object('perk',p_perk_code)); end if;
 return jsonb_build_object('ok',true,'awarded',inserted_perk,'business_id',p_business_id,'perk_code',p_perk_code,'tier',tier); end; $$;

create or replace function public.record_progression_action(p_action text,p_reference_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,auth,extensions,pg_temp
as $$ declare uid uuid:=auth.uid(); pts integer; label_text text; today date:=current_date; last_date date; cur integer; longest integer; txn_id uuid; inserted boolean:=false; begin
 if uid is null then raise exception 'Not authenticated'; end if;
 select points,label into pts,label_text from public.progression_actions where code=p_action and enabled=true;
 if pts is null then raise exception 'Unknown progression action: %',p_action; end if;
 if p_reference_id is not null and exists(select 1 from public.point_transactions where user_id=uid and reason=p_action and reference_id=p_reference_id) then return jsonb_build_object('awarded',false,'reason','already_awarded'); end if;
 insert into public.point_transactions(user_id,points,reason,reference_id) values(uid,pts,p_action,p_reference_id) on conflict (user_id,reason,reference_id) where reference_id is not null do nothing returning id into txn_id;
 inserted:=txn_id is not null;
 if not inserted then return jsonb_build_object('awarded',false,'reason','already_awarded'); end if;
 select coalesce(current_streak,0),coalesce(longest_streak,0),last_activity_date into cur,longest,last_date from public.user_streaks where user_id=uid for update;
 if not found then cur:=1; longest:=1; insert into public.user_streaks(user_id,current_streak,longest_streak,last_activity_date,streak_started_at) values(uid,1,1,today,now()); elsif last_date=today then null; elsif last_date=today-1 then cur:=cur+1; longest:=greatest(longest,cur); update public.user_streaks set current_streak=cur,longest_streak=longest,last_activity_date=today,updated_at=now() where user_id=uid; else cur:=1; update public.user_streaks set current_streak=1,last_activity_date=today,streak_started_at=now(),updated_at=now() where user_id=uid; end if;
 update public.profiles set points=coalesce(points,0)+pts,level=floor((coalesce(points,0)+pts)/100)+1,streak=cur where id=uid;
 return jsonb_build_object('awarded',true,'action',p_action,'points',pts,'total_points',(select points from public.profiles where id=uid),'level',(select level from public.profiles where id=uid),'streak',cur,'transaction_id',txn_id); end; $$;
