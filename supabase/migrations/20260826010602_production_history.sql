create or replace function public.get_platform_leaderboard(p_leaderboard_key text default 'users:points', p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare v_key text:=lower(trim(p_leaderboard_key)); v_result jsonb;
begin
  if v_key='users:points' then
    select coalesce(jsonb_agg(jsonb_build_object('rank',rank,'user_id',user_id,'display_name',display_name,'username',username,'points',points,'level',level,'streak',streak)), '[]'::jsonb) into v_result
    from public.get_user_leaderboard(greatest(1,least(coalesce(p_limit,20),100)));
  elsif v_key like 'business:%' then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_result from public.get_business_leaderboard(replace(v_key,'business:',''),greatest(1,least(coalesce(p_limit,20),100))) x;
  elsif v_key like 'fleet_network:%' then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_result from public.get_fleet_network_leaderboard(replace(v_key,'fleet_network:',''),greatest(1,least(coalesce(p_limit,20),100))) x;
  else raise exception 'Unknown leaderboard: %',p_leaderboard_key;
  end if;
  return v_result;
end;
$$;
