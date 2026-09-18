-- Preview/runtime reconciliation: restore safe authenticated read/execute edges while preserving RLS and owner-only controls.

grant select on public.app_business_memberships to authenticated;
grant select on public.business_members to authenticated;
grant select on public.businesses to authenticated;
grant select on public.partner_program_memberships to authenticated;
grant select on public.places to authenticated;
grant select on public.badges to authenticated;
grant select on public.favorites to authenticated;

grant execute on function public.record_game_result(text,integer,integer,jsonb) to authenticated;
grant execute on function public.prepare_universal_location_discovery(double precision,double precision,integer,uuid) to authenticated;
revoke execute on function public.prepare_universal_location_discovery(double precision,double precision,integer,uuid) from anon;
revoke execute on function public.record_game_result(text,integer,integer,jsonb) from anon;

drop function if exists public.quest_list_available(integer);
create or replace function public.quest_list_available(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'description',q.description,'status',q.status,'start_at',q.start_at,'end_at',q.end_at,'reward_config',q.reward_config,'steps',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'order',s.step_order,'type',s.step_type,'title',s.title,'description',s.description,'required',s.required,'xp_reward',s.xp_reward) order by s.step_order),'[]'::jsonb) from public.quest_steps s where s.quest_id=q.id)) order by q.start_at desc nulls last) from (select q0.* from public.quests q0 where q0.status in ('active','published','live') and (q0.start_at is null or q0.start_at<=now()) and (q0.end_at is null or q0.end_at>=now()) order by q0.start_at desc nulls last limit greatest(1,least(coalesce(p_limit,20),50))) q),'[]'::jsonb);
end;
$$;
revoke all on function public.quest_list_available(integer) from public, anon;
grant execute on function public.quest_list_available(integer) to authenticated;
grant execute on function public.quest_start(uuid) to authenticated;
revoke execute on function public.quest_start(uuid) from anon;

create table if not exists public.location_discovery_events (id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete set null,latitude double precision not null,longitude double precision not null,radius_km numeric not null default 8,sources text[] not null default '{}',discovered_count integer not null default 0,created_at timestamptz not null default now());
create index if not exists location_discovery_events_created_idx on public.location_discovery_events(created_at desc);
create index if not exists location_discovery_events_user_idx on public.location_discovery_events(user_id,created_at desc);
alter table public.location_discovery_events enable row level security;
drop policy if exists location_discovery_events_insert_own on public.location_discovery_events;
drop policy if exists location_discovery_events_select_own on public.location_discovery_events;
create policy location_discovery_events_insert_own on public.location_discovery_events for insert to authenticated with check (user_id=auth.uid());
create policy location_discovery_events_select_own on public.location_discovery_events for select to authenticated using (user_id=auth.uid());
create or replace function public.record_location_discovery_event(p_latitude double precision,p_longitude double precision,p_radius_km numeric default 8,p_sources text[] default '{}',p_discovered_count integer default 0) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$ declare v_id uuid; begin if auth.uid() is null then raise exception 'Authentication required'; end if; if p_latitude is null or p_longitude is null then raise exception 'latitude and longitude are required'; end if; insert into public.location_discovery_events(user_id,latitude,longitude,radius_km,sources,discovered_count) values(auth.uid(),p_latitude,p_longitude,least(greatest(coalesce(p_radius_km,8),1),50),coalesce(p_sources,'{}'),greatest(coalesce(p_discovered_count,0),0)) returning id into v_id; return v_id; end; $$;
grant execute on function public.record_location_discovery_event(double precision,double precision,numeric,text[],integer) to authenticated;
revoke execute on function public.record_location_discovery_event(double precision,double precision,numeric,text[],integer) from anon;

insert into public.business_members(business_id,user_id,role,created_at)
select b.id,p.id,'owner'::business_member_role,now()
from public.businesses b cross join public.profiles p
where p.is_platform_owner=true and b.name in ('Kleenest Fleet','Kleenest Enterprise')
and not exists (select 1 from public.business_members bm where bm.business_id=b.id and bm.user_id=p.id);
update public.profiles set is_business_user=true,updated_at=now() where is_platform_owner=true;

revoke execute on function public.admin_assign_business_member(uuid,uuid,business_member_role) from anon;
revoke execute on function public.admin_set_business_access(uuid,business_tier,boolean,boolean,text) from anon;
