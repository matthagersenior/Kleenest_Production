create or replace function public.consumer_active_objectives()
returns jsonb language sql stable security definer set search_path='' as $$
with v2 as (
 select jsonb_build_object(
   'id',o.id,'source','progression_v2','kind',o.kind,'code',o.code,'title',o.title,'description',o.description,
   'rules',o.rules,'rewards',o.rewards,'starts_at',o.starts_at,'ends_at',o.ends_at,
   'progress',coalesce(up.progress,0),'target',coalesce(up.target,(o.rules->>'target')::numeric,1),'state',coalesce(up.state,'active')
 ) item,
 case o.kind when 'quest' then 1 when 'mission' then 2 when 'challenge' then 3 when 'journey' then 4 when 'campaign' then 5 else 6 end ord,
 o.title sort_title
 from public.progression_objectives_v2 o
 left join public.user_objective_progress_v2 up on up.objective_id=o.id and up.user_id=auth.uid()
 where auth.uid() is not null and o.status='active' and (o.starts_at is null or o.starts_at<=now()) and (o.ends_at is null or o.ends_at>=now())
), legacy_quests as (
 select jsonb_build_object(
   'id',q.id,'source','legacy_quest','kind','quest','code','quest:'||q.id::text,'title',q.name,'description',coalesce(q.description,''),
   'rules',coalesce(q.targeting_config,'{}'::jsonb)||jsonb_build_object('route_config',coalesce(q.route_config,'{}'::jsonb)),
   'rewards',coalesce(q.reward_config,'{}'::jsonb),'starts_at',q.start_at,'ends_at',q.end_at,
   'progress',coalesce(qp.progress,0),'target',1,'state',coalesce(qp.status,'available')
 ) item,1 ord,q.name sort_title
 from public.quests q
 left join public.quest_participation qp on qp.quest_id=q.id and qp.user_id=auth.uid()
 where auth.uid() is not null and q.status in ('active','published') and (q.start_at is null or q.start_at<=now()) and (q.end_at is null or q.end_at>=now())
), legacy_contests as (
 select jsonb_build_object(
   'id',c.id,'source','legacy_contest','kind','contest','code','contest:'||c.id::text,'title',c.name,'description',coalesce(c.description,''),
   'rules',coalesce(c.scoring_rules,'{}'::jsonb)||jsonb_build_object('metrics_config',coalesce(c.metrics_config,'{}'::jsonb)),
   'rewards',coalesce(c.rewards,'{}'::jsonb),'starts_at',c.starts_at,'ends_at',c.ends_at,
   'progress',0,'target',1,'state','active','business_id',c.business_id
 ) item,6 ord,c.name sort_title
 from public.contests c
 where auth.uid() is not null and c.status='active' and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>=now())
), business_campaigns as (
 select jsonb_build_object(
   'id',bc.id,'source','business_campaign','kind','campaign','code','business-campaign:'||bc.id::text,'title',bc.name,'description',coalesce(bc.description,''),
   'rules',jsonb_build_object('location_id',bc.location_id,'business_id',bc.business_id),
   'rewards','{}'::jsonb,'starts_at',bc.starts_at,'ends_at',bc.ends_at,
   'progress',0,'target',1,'state','active','business_id',bc.business_id,'location_id',bc.location_id
 ) item,5 ord,bc.name sort_title
 from public.business_campaigns bc
 where auth.uid() is not null and bc.status='active' and (bc.starts_at is null or bc.starts_at<=now()) and (bc.ends_at is null or bc.ends_at>=now())
), all_items as (
 select * from v2 union all select * from legacy_quests union all select * from legacy_contests union all select * from business_campaigns
)
select coalesce(jsonb_agg(item order by ord,sort_title),'[]'::jsonb) from all_items
$$;
grant execute on function public.consumer_active_objectives() to authenticated;
