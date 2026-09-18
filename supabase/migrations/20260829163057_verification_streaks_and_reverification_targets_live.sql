create or replace function public.record_verification_streak(p_location_id uuid) returns jsonb language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $function$
declare s public.verification_streaks; d date:=current_date; v_streak integer; v_longest integer;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 select * into s from public.verification_streaks where user_id=auth.uid() for update;
 if not found then insert into public.verification_streaks(user_id,current_streak,longest_streak,last_verified_at,last_verified_date,streak_started_at,last_location_id,updated_at) values(auth.uid(),1,1,now(),d,now(),p_location_id,now()); return jsonb_build_object('current_streak',1,'longest_streak',1,'last_verified_date',d,'location_id',p_location_id); end if;
 if s.last_verified_date=d then update public.verification_streaks set last_verified_at=now(),last_location_id=p_location_id,updated_at=now() where user_id=auth.uid(); return jsonb_build_object('current_streak',s.current_streak,'longest_streak',s.longest_streak,'last_verified_date',d,'location_id',p_location_id,'already_counted',true); end if;
 v_streak:=case when s.last_verified_date=d-1 then s.current_streak+1 else 1 end; v_longest:=greatest(s.longest_streak,v_streak);
 update public.verification_streaks set current_streak=v_streak,longest_streak=v_longest,last_verified_at=now(),last_verified_date=d,streak_started_at=case when s.last_verified_date=d-1 then s.streak_started_at else now() end,last_location_id=p_location_id,updated_at=now() where user_id=auth.uid();
 return jsonb_build_object('current_streak',v_streak,'longest_streak',v_longest,'last_verified_date',d,'location_id',p_location_id,'already_counted',false);
end $function$;
revoke all on function public.record_verification_streak(uuid) from public,anon; grant execute on function public.record_verification_streak(uuid) to authenticated;
create or replace function public.select_reverification_targets(p_limit integer default 25) returns table(location_id uuid,priority numeric,staleness_status text,freshness_score numeric,confidence_score numeric,last_verified_at timestamptz,reverification_due_at timestamptz) language sql stable security definer set search_path to 'public','auth','extensions','pg_temp' as $function$
select lc.location_id,round((case lc.staleness_status when 'very_stale' then 100 when 'stale' then 75 when 'aging' then 45 when 'recent' then 15 else 100 end+greatest(0,100-coalesce(lc.freshness_score,0))+greatest(0,100-coalesce(lc.score,0))*0.5),2),lc.staleness_status,lc.freshness_score,lc.score,lc.last_verified_at,lc.reverification_due_at from public.location_confidence lc where lc.staleness_status in ('unknown','aging','stale','very_stale') or lc.reverification_due_at<=now() order by 2 desc,lc.reverification_due_at nulls first limit greatest(1,least(coalesce(p_limit,25),100));
$function$;
revoke all on function public.select_reverification_targets(integer) from public,anon; grant execute on function public.select_reverification_targets(integer) to authenticated;
