create or replace function public.quest_my_active_progress(p_limit integer default 20)
returns jsonb
language sql
stable
security invoker
set search_path to 'public','auth','pg_temp'
as $$
  select coalesce(jsonb_agg(item order by item->>'started_at' desc),'[]'::jsonb)
  from (
    select jsonb_build_object(
      'participation_id', p.id,
      'quest_id', p.quest_id,
      'status', p.status,
      'current_step_order', p.current_step_order,
      'progress', p.progress,
      'xp_earned', p.xp_earned,
      'reward_state', p.reward_state,
      'started_at', p.started_at,
      'completed_at', p.completed_at,
      'updated_at', p.updated_at,
      'quest', jsonb_build_object(
        'id', q.id,
        'name', q.name,
        'description', q.description,
        'reward_config', q.reward_config,
        'start_at', q.start_at,
        'end_at', q.end_at
      ),
      'steps', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id,
          'step_order', s.step_order,
          'type', s.step_type,
          'title', s.title,
          'description', s.description,
          'required', s.required,
          'xp_reward', s.xp_reward,
          'location_id', s.location_id,
          'completed', exists(
            select 1 from public.quest_step_events e
            where e.participation_id=p.id and e.quest_step_id=s.id and e.user_id=auth.uid()
          ),
          'last_event_at', (
            select max(e.created_at) from public.quest_step_events e
            where e.participation_id=p.id and e.quest_step_id=s.id and e.user_id=auth.uid()
          )
        ) order by s.step_order)
        from public.quest_steps s where s.quest_id=p.quest_id
      ),'[]'::jsonb)
    ) item
    from public.quest_participation p
    join public.quests q on q.id=p.quest_id
    where p.user_id=auth.uid()
      and p.status in ('active','started','in_progress')
    order by p.started_at desc
    limit least(greatest(coalesce(p_limit,20),1),50)
  ) x;
$$;
revoke execute on function public.quest_my_active_progress(integer) from public,anon;
grant execute on function public.quest_my_active_progress(integer) to authenticated;
