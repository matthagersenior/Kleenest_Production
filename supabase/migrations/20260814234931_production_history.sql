create or replace function public.submit_contest_entry(p_contest_id uuid,p_entry jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare metric text; computed_score integer:=0; c contests;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 if not public.has_kleenest_premium() then raise exception 'premium_required'; end if;
 select * into c from contests where id=p_contest_id and active and starts_at<=now() and ends_at>now();
 if c.id is null then raise exception 'contest_unavailable'; end if;
 metric:=coalesce(c.rules->>'metric','points');
 if metric='checkins' then select coalesce(checkin_total,0) into computed_score from user_gamification_stats where user_id=auth.uid();
 elsif metric='reviews' then select coalesce(review_total,0) into computed_score from user_gamification_stats where user_id=auth.uid();
 elsif metric='streak' then select coalesce(current_streak,0) into computed_score from user_streaks where user_id=auth.uid();
 else select coalesce(sum(points),0)::integer into computed_score from points_ledger where user_id=auth.uid(); end if;
 insert into contest_entries(contest_id,user_id,score,entry) values(p_contest_id,auth.uid(),computed_score,coalesce(p_entry,'{}'::jsonb)) on conflict(contest_id,user_id) do update set score=excluded.score,entry=excluded.entry,updated_at=now();
 return jsonb_build_object('submitted',true,'score',computed_score,'metric',metric);
end $$;
create or replace function public.follow_user(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare affected integer:=0;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 if p_user_id=auth.uid() then raise exception 'cannot_follow_self'; end if;
 insert into user_follows(follower_id,followed_id) values(auth.uid(),p_user_id) on conflict do nothing;
 get diagnostics affected=row_count;
 if affected>0 then perform award_gamification_points('follow'); end if;
 return jsonb_build_object('following',true,'new_follow',affected>0);
end $$;
revoke all on function public.submit_contest_entry(uuid,jsonb) from public;
grant execute on function public.submit_contest_entry(uuid,jsonb) to authenticated;
revoke all on function public.follow_user(uuid) from public;
grant execute on function public.follow_user(uuid) to authenticated;
