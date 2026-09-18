delete from public.quest_steps where quest_id in (select id from public.quests where owner_type='admin' and owner_id is null and name like 'Kleenest Trust Quest:%');
delete from public.quests where owner_type='admin' and owner_id is null and name like 'Kleenest Trust Quest:%';
with seed(name,description,reward_config,targeting_config,route_config) as (
 values
 ('Kleenest Trust Quest: First Verified Visit','Complete a verified restroom visit and learn the core trust loop.',jsonb_build_object('xp',50,'points',25),jsonb_build_object('audience','consumer'),jsonb_build_object('mode','evidence')),
 ('Kleenest Trust Quest: Trust Builder','Check in, record evidence, and publish a useful verified review.',jsonb_build_object('xp',150,'points',75),jsonb_build_object('audience','consumer'),jsonb_build_object('mode','evidence')),
 ('Kleenest Trust Quest: Accessibility Scout','Verify a visit and contribute an accessibility-focused evidence signal.',jsonb_build_object('xp',100,'points',50),jsonb_build_object('audience','consumer'),jsonb_build_object('mode','accessibility')),
 ('Kleenest Trust Quest: Freshness Reporter','Use a verified visit to provide current condition information for the next visitor.',jsonb_build_object('xp',100,'points',50),jsonb_build_object('audience','consumer'),jsonb_build_object('mode','freshness')),
 ('Kleenest Trust Quest: Review Craft','Turn a verified visit into a specific, actionable review.',jsonb_build_object('xp',125,'points',60),jsonb_build_object('audience','consumer'),jsonb_build_object('mode','review_quality')),
 ('Kleenest Trust Quest: Bathroom Trust Champion','Complete a full evidence loop and reinforce it through a trust game challenge.',jsonb_build_object('xp',250,'points',125),jsonb_build_object('audience','consumer'),jsonb_build_object('mode','trust_champion'))
), ins as (
 insert into public.quests(owner_type,owner_id,name,description,status,start_at,reward_config,targeting_config,route_config)
 select 'admin',null,name,description,'active',now(),reward_config,targeting_config,route_config from seed returning id,name
)
insert into public.quest_steps(quest_id,step_order,step_type,title,description,required,xp_reward,reward_config,validation_config)
select i.id,1,'checkin','Complete a verified visit','Use GPS or QR check-in at a canonical restroom location.',true,25,jsonb_build_object('points',25),jsonb_build_object('event_type','check_in') from ins i where i.name='Kleenest Trust Quest: First Verified Visit'
union all select i.id,1,'checkin','Verify your visit','Start with a trusted check-in.',true,25,jsonb_build_object('points',25),jsonb_build_object('event_type','check_in') from ins i where i.name='Kleenest Trust Quest: Trust Builder'
union all select i.id,2,'evidence','Report what you observed','Add current condition or cleanliness evidence.',true,50,jsonb_build_object('points',25),jsonb_build_object('event_type','observation') from ins i where i.name='Kleenest Trust Quest: Trust Builder'
union all select i.id,3,'review','Publish a useful review','Tell the next visitor what matters.',true,75,jsonb_build_object('points',25),jsonb_build_object('event_type','review') from ins i where i.name='Kleenest Trust Quest: Trust Builder'
union all select i.id,1,'checkin','Verify the location','Start with a verified visit.',true,25,jsonb_build_object('points',25),jsonb_build_object('event_type','check_in') from ins i where i.name='Kleenest Trust Quest: Accessibility Scout'
union all select i.id,2,'evidence','Report accessibility','Record observed accessibility facts.',true,75,jsonb_build_object('points',25),jsonb_build_object('event_type','observation','focus','accessibility') from ins i where i.name='Kleenest Trust Quest: Accessibility Scout'
union all select i.id,1,'checkin','Verify current presence','Create a current visit signal.',true,25,jsonb_build_object('points',25),jsonb_build_object('event_type','check_in') from ins i where i.name='Kleenest Trust Quest: Freshness Reporter'
union all select i.id,2,'evidence','Report current condition','Record cleanliness, availability, safety, or condition.',true,75,jsonb_build_object('points',25),jsonb_build_object('event_type','observation') from ins i where i.name='Kleenest Trust Quest: Freshness Reporter'
union all select i.id,1,'checkin','Verify your visit','Start from a verified visit.',true,25,jsonb_build_object('points',25),jsonb_build_object('event_type','check_in') from ins i where i.name='Kleenest Trust Quest: Review Craft'
union all select i.id,2,'review','Write an actionable review','Include concrete information for the next visitor.',true,100,jsonb_build_object('points',35),jsonb_build_object('event_type','review') from ins i where i.name='Kleenest Trust Quest: Review Craft'
union all select i.id,1,'checkin','Verify your visit','Start with a verified restroom visit.',true,25,jsonb_build_object('points',25),jsonb_build_object('event_type','check_in') from ins i where i.name='Kleenest Trust Quest: Bathroom Trust Champion'
union all select i.id,2,'evidence','Add structured evidence','Contribute a current observation.',true,50,jsonb_build_object('points',25),jsonb_build_object('event_type','observation') from ins i where i.name='Kleenest Trust Quest: Bathroom Trust Champion'
union all select i.id,3,'review','Publish the trust signal','Publish a useful verified review.',true,75,jsonb_build_object('points',35),jsonb_build_object('event_type','review') from ins i where i.name='Kleenest Trust Quest: Bathroom Trust Champion'
union all select i.id,4,'challenge','Play a trust game','Complete a Bathroom Trust Game Center challenge.',true,100,jsonb_build_object('points',40),jsonb_build_object('event_type','game') from ins i where i.name='Kleenest Trust Quest: Bathroom Trust Champion';
