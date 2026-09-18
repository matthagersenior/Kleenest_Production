create table if not exists public.progression_supply_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('quest','mission','challenge','journey','campaign','contest')),
  code_prefix text not null unique,
  title text not null,
  description text not null default '',
  cadence text not null check (cadence in ('daily','weekly','monthly','evergreen')),
  duration_hours integer not null default 168 check (duration_hours between 1 and 8760),
  rules jsonb not null default '{}'::jsonb,
  rewards jsonb not null default '{}'::jsonb,
  scope jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.progression_supply_templates enable row level security;
revoke all on public.progression_supply_templates from anon, authenticated;
grant select,insert,update,delete on public.progression_supply_templates to service_role;

create table if not exists public.progression_supply_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  created_count integer not null default 0,
  expired_count integer not null default 0,
  details jsonb not null default '{}'::jsonb
);
alter table public.progression_supply_runs enable row level security;
revoke all on public.progression_supply_runs from anon, authenticated;
grant select,insert on public.progression_supply_runs to service_role;

create or replace function public.owner_progression_objective_list()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not public.is_platform_owner_session() then raise exception 'owner control-plane access required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',o.id,'kind',o.kind,'code',o.code,'title',o.title,'description',o.description,
      'status',o.status,'starts_at',o.starts_at,'ends_at',o.ends_at,'rules',o.rules,
      'rewards',o.rewards,'scope',o.scope,'created_at',o.created_at,
      'participants',(select count(*) from public.user_objective_progress_v2 p where p.objective_id=o.id),
      'completed',(select count(*) from public.user_objective_progress_v2 p where p.objective_id=o.id and p.state='completed')
    ) order by coalesce(o.starts_at,o.created_at) desc,o.created_at desc)
    from public.progression_objectives_v2 o
  ),'[]'::jsonb);
end $$;

create or replace function public.owner_progression_objective_upsert(
  p_id uuid,
  p_kind text,
  p_code text,
  p_title text,
  p_description text,
  p_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_rules jsonb,
  p_rewards jsonb,
  p_scope jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor uuid:=auth.uid();
  v_id uuid:=p_id;
  v_before jsonb;
  v_after jsonb;
begin
  if v_actor is null or not public.is_platform_owner_session() then raise exception 'owner control-plane access required'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'reason required'; end if;
  if lower(coalesce(p_kind,'')) not in ('quest','mission','challenge','journey','campaign','contest') then raise exception 'unsupported objective kind'; end if;
  if lower(coalesce(p_status,'')) not in ('draft','scheduled','active','paused','ended','archived') then raise exception 'unsupported objective status'; end if;
  if nullif(trim(coalesce(p_code,'')),'') is null or nullif(trim(coalesce(p_title,'')),'') is null then raise exception 'code and title required'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at<=p_starts_at then raise exception 'end must follow start'; end if;
  if coalesce((p_rules->>'target')::numeric,1) < 1 then raise exception 'objective target must be at least 1'; end if;
  if coalesce((p_rewards->>'xp')::integer,0) < 0 or coalesce((p_rewards->>'xp')::integer,0) > 10000 then raise exception 'objective xp reward out of range'; end if;

  if v_id is null then
    insert into public.progression_objectives_v2(kind,code,title,description,status,starts_at,ends_at,rules,rewards,scope)
    values(lower(p_kind),trim(p_code),trim(p_title),coalesce(p_description,''),lower(p_status),p_starts_at,p_ends_at,coalesce(p_rules,'{}'::jsonb),coalesce(p_rewards,'{}'::jsonb),coalesce(p_scope,'{}'::jsonb))
    returning id into v_id;
  else
    select to_jsonb(o) into v_before from public.progression_objectives_v2 o where o.id=v_id for update;
    if v_before is null then raise exception 'objective not found'; end if;
    update public.progression_objectives_v2
      set kind=lower(p_kind),code=trim(p_code),title=trim(p_title),description=coalesce(p_description,''),status=lower(p_status),starts_at=p_starts_at,ends_at=p_ends_at,rules=coalesce(p_rules,'{}'::jsonb),rewards=coalesce(p_rewards,'{}'::jsonb),scope=coalesce(p_scope,'{}'::jsonb)
      where id=v_id;
  end if;
  select to_jsonb(o) into v_after from public.progression_objectives_v2 o where o.id=v_id;
  insert into public.admin_capability_audit(admin_user_id,target_user_id,previous_state,new_state,reason)
  values(v_actor,v_actor,v_before,v_after,'Progression objective: '||trim(p_reason));
  return v_after;
end $$;

create or replace function public.owner_progression_objective_set_status(p_id uuid,p_status text,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_actor uuid:=auth.uid(); v_before jsonb; v_after jsonb;
begin
  if v_actor is null or not public.is_platform_owner_session() then raise exception 'owner control-plane access required'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'reason required'; end if;
  if lower(coalesce(p_status,'')) not in ('draft','scheduled','active','paused','ended','archived') then raise exception 'unsupported objective status'; end if;
  select to_jsonb(o) into v_before from public.progression_objectives_v2 o where o.id=p_id for update;
  if v_before is null then raise exception 'objective not found'; end if;
  update public.progression_objectives_v2 set status=lower(p_status) where id=p_id returning to_jsonb(progression_objectives_v2.*) into v_after;
  insert into public.admin_capability_audit(admin_user_id,target_user_id,previous_state,new_state,reason)
  values(v_actor,v_actor,v_before,v_after,'Progression objective status: '||trim(p_reason));
  return v_after;
end $$;

create or replace function public.owner_progression_objective_delete(p_id uuid,p_reason text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare v_actor uuid:=auth.uid(); v_before jsonb;
begin
  if v_actor is null or not public.is_platform_owner_session() then raise exception 'owner control-plane access required'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'reason required'; end if;
  select to_jsonb(o) into v_before from public.progression_objectives_v2 o where o.id=p_id for update;
  if v_before is null then return false; end if;
  if exists(select 1 from public.user_objective_progress_v2 p where p.objective_id=p_id) then raise exception 'objective has participant history; archive it instead of deleting'; end if;
  delete from public.progression_objectives_v2 where id=p_id;
  insert into public.admin_capability_audit(admin_user_id,target_user_id,previous_state,new_state,reason)
  values(v_actor,v_actor,v_before,jsonb_build_object('deleted',true,'id',p_id),'Progression objective delete: '||trim(p_reason));
  return true;
end $$;

create or replace function public.maintain_progression_supply()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  t public.progression_supply_templates%rowtype;
  v_cycle text;
  v_start timestamptz;
  v_end timestamptz;
  v_code text;
  v_created integer:=0;
  v_expired integer:=0;
  v_details jsonb:='[]'::jsonb;
begin
  update public.progression_objectives_v2
    set status='ended'
    where status in ('active','scheduled') and ends_at is not null and ends_at<now();
  get diagnostics v_expired = row_count;

  for t in select * from public.progression_supply_templates where enabled order by kind,code_prefix loop
    if t.cadence='daily' then
      v_cycle:=to_char(current_date,'YYYYMMDD'); v_start:=date_trunc('day',now());
    elsif t.cadence='weekly' then
      v_cycle:=to_char(current_date,'IYYY-IW'); v_start:=date_trunc('week',now());
    elsif t.cadence='monthly' then
      v_cycle:=to_char(current_date,'YYYYMM'); v_start:=date_trunc('month',now());
    else
      v_cycle:='evergreen'; v_start:=now();
    end if;
    v_code:=t.code_prefix||'-'||v_cycle;
    v_end:=case when t.cadence='evergreen' then null else v_start+make_interval(hours=>t.duration_hours) end;
    if not exists(select 1 from public.progression_objectives_v2 o where o.code=v_code) then
      insert into public.progression_objectives_v2(kind,code,title,description,status,starts_at,ends_at,rules,rewards,scope)
      values(t.kind,v_code,t.title,t.description,case when v_start<=now() then 'active' else 'scheduled' end,v_start,v_end,t.rules,t.rewards,t.scope||jsonb_build_object('supply_template_id',t.id,'supply_cycle',v_cycle,'generated',true));
      v_created:=v_created+1;
      v_details:=v_details||jsonb_build_array(jsonb_build_object('kind',t.kind,'code',v_code));
    end if;
  end loop;
  insert into public.progression_supply_runs(created_count,expired_count,details) values(v_created,v_expired,jsonb_build_object('created',v_details));
  return jsonb_build_object('created_count',v_created,'expired_count',v_expired,'created',v_details,'ran_at',now());
end $$;

create or replace function public.owner_progression_supply_status()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not public.is_platform_owner_session() then raise exception 'owner control-plane access required'; end if;
  return jsonb_build_object(
    'active_by_kind',coalesce((select jsonb_object_agg(kind,cnt) from (select kind,count(*) cnt from public.progression_objectives_v2 where status='active' and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>=now()) group by kind) q),'{}'::jsonb),
    'scheduled_by_kind',coalesce((select jsonb_object_agg(kind,cnt) from (select kind,count(*) cnt from public.progression_objectives_v2 where status='scheduled' group by kind) q),'{}'::jsonb),
    'expiring_72h',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'title',title,'ends_at',ends_at) order by ends_at) from public.progression_objectives_v2 where status='active' and ends_at between now() and now()+interval '72 hours'),'[]'::jsonb),
    'templates',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'code_prefix',code_prefix,'title',title,'cadence',cadence,'enabled',enabled,'duration_hours',duration_hours,'rules',rules,'rewards',rewards,'scope',scope) order by kind,code_prefix) from public.progression_supply_templates),'[]'::jsonb),
    'last_run',(select to_jsonb(r) from public.progression_supply_runs r order by ran_at desc limit 1)
  );
end $$;

create or replace function public.owner_maintain_progression_supply()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
  if v_actor is null or not public.is_platform_owner_session() then raise exception 'owner control-plane access required'; end if;
  v_result:=public.maintain_progression_supply();
  insert into public.admin_capability_audit(admin_user_id,target_user_id,previous_state,new_state,reason)
  values(v_actor,v_actor,null,v_result,'Progression supply manual refresh');
  return v_result;
end $$;

revoke all on function public.owner_progression_objective_list() from public,anon;
revoke all on function public.owner_progression_objective_upsert(uuid,text,text,text,text,text,timestamptz,timestamptz,jsonb,jsonb,jsonb,text) from public,anon;
revoke all on function public.owner_progression_objective_set_status(uuid,text,text) from public,anon;
revoke all on function public.owner_progression_objective_delete(uuid,text) from public,anon;
revoke all on function public.owner_progression_supply_status() from public,anon;
revoke all on function public.owner_maintain_progression_supply() from public,anon;
grant execute on function public.owner_progression_objective_list() to authenticated,service_role;
grant execute on function public.owner_progression_objective_upsert(uuid,text,text,text,text,text,timestamptz,timestamptz,jsonb,jsonb,jsonb,text) to authenticated,service_role;
grant execute on function public.owner_progression_objective_set_status(uuid,text,text) to authenticated,service_role;
grant execute on function public.owner_progression_objective_delete(uuid,text) to authenticated,service_role;
grant execute on function public.owner_progression_supply_status() to authenticated,service_role;
grant execute on function public.owner_maintain_progression_supply() to authenticated,service_role;
revoke all on function public.maintain_progression_supply() from public,anon,authenticated;
grant execute on function public.maintain_progression_supply() to service_role;

insert into public.progression_supply_templates(kind,code_prefix,title,description,cadence,duration_hours,rules,rewards,scope)
values
('quest','supply-daily-discovery','Daily Discovery Pulse','Add a trustworthy restroom discovery to keep the Kleenest map fresh.','daily',36,'{"action":"discover_any","target":1}'::jsonb,'{"xp":100}'::jsonb,'{"audience":"consumer"}'::jsonb),
('quest','supply-daily-photo','Photo Proof Run','Add useful restroom photo evidence to strengthen the trust network.','daily',36,'{"action":"add_photo","target":2}'::jsonb,'{"xp":80}'::jsonb,'{"audience":"consumer"}'::jsonb),
('mission','supply-weekly-review','Weekly Reviewer Mission','Publish substantive restroom reviews that help the next person choose confidently.','weekly',192,'{"action":"substantive_review","target":3}'::jsonb,'{"xp":200}'::jsonb,'{"audience":"consumer"}'::jsonb),
('mission','supply-weekly-amenity','Amenity Mapper Mission','Improve restroom amenity detail across the Kleenest network.','weekly',192,'{"action":"add_amenity","target":5}'::jsonb,'{"xp":200}'::jsonb,'{"audience":"consumer"}'::jsonb),
('challenge','supply-weekly-verification','Verification Challenge','Recheck location truth and keep stale restroom information from lingering.','weekly',192,'{"action":"verify_location","target":5}'::jsonb,'{"xp":250}'::jsonb,'{"audience":"consumer"}'::jsonb),
('challenge','supply-weekly-reverify','Freshness Challenge','Reverify stale restroom evidence before other travelers rely on it.','weekly',192,'{"action":"reverify_stale","target":3}'::jsonb,'{"xp":250}'::jsonb,'{"audience":"consumer"}'::jsonb),
('journey','supply-monthly-pathfinder','Monthly Pathfinder Journey','Build a broad trail of discoveries and verifications across the network.','monthly',840,'{"actions":["discover_gps","discover_onsite_live","verify_location"],"target":10}'::jsonb,'{"xp":500}'::jsonb,'{"audience":"consumer"}'::jsonb),
('journey','supply-monthly-access','Accessible Network Journey','Help map accessibility details over a longer community journey.','monthly',840,'{"action":"add_accessibility","target":8}'::jsonb,'{"xp":500}'::jsonb,'{"audience":"consumer"}'::jsonb),
('campaign','supply-weekly-accessibility','Accessibility Drive','Expand reliable accessibility information across active Kleenest locations.','weekly',192,'{"action":"add_accessibility","target":4}'::jsonb,'{"xp":150}'::jsonb,'{"audience":"consumer"}'::jsonb),
('campaign','supply-weekly-community','Community Signal Campaign','Make helpful contributions that improve the shared restroom trust network.','weekly',192,'{"action":"helpful_contribution","target":5}'::jsonb,'{"xp":150}'::jsonb,'{"audience":"consumer"}'::jsonb),
('contest','supply-weekly-discovery-sprint','Discovery Sprint','Compete by contributing verified restroom discoveries during this week’s sprint.','weekly',192,'{"action":"discover_any","target":5}'::jsonb,'{"xp":300}'::jsonb,'{"audience":"consumer"}'::jsonb),
('contest','supply-weekly-photo-sprint','Evidence Sprint','Strengthen the network with photo evidence during this week’s community sprint.','weekly',192,'{"action":"add_photo","target":5}'::jsonb,'{"xp":300}'::jsonb,'{"audience":"consumer"}'::jsonb)
on conflict(code_prefix) do update set title=excluded.title,description=excluded.description,cadence=excluded.cadence,duration_hours=excluded.duration_hours,rules=excluded.rules,rewards=excluded.rewards,scope=excluded.scope,enabled=true,updated_at=now();

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='kleenest_progression_supply_daily' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('kleenest_progression_supply_daily','15 5 * * *','select public.maintain_progression_supply();');
end $$;

select public.maintain_progression_supply();
