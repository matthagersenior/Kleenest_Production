create or replace function public.quest_list_available(p_limit integer default 20)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'description',q.description,'status',q.status,'start_at',q.start_at,'end_at',q.end_at,'reward_config',q.reward_config,'steps',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'order',s.step_order,'type',s.step_type,'title',s.title,'description',s.description,'required',s.required,'xp_reward',s.xp_reward) order by s.step_order),'[]'::jsonb) from public.quest_steps s where s.quest_id=q.id))) order by q.start_at desc nulls last limit greatest(1,least(coalesce(p_limit,20),50))), '[]'::jsonb);
end; $$;
revoke all on function public.quest_list_available(integer) from public;
grant execute on function public.quest_list_available(integer) to authenticated;
