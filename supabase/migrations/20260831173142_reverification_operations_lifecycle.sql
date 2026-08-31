create table if not exists public.business_reverification_cases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  status text not null default 'open' check (status in ('open','in_progress','resolved','dismissed')),
  assigned_to uuid,
  qr_id uuid references public.qr_codes(id) on delete set null,
  opened_at timestamptz not null default now(),
  assigned_at timestamptz,
  resolved_at timestamptz,
  dismissed_at timestamptz,
  resolution_reason text,
  resolution_snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create unique index if not exists business_reverification_cases_active_idx on public.business_reverification_cases(business_id,location_id) where status in ('open','in_progress');
create index if not exists business_reverification_cases_business_status_idx on public.business_reverification_cases(business_id,status,updated_at desc);
alter table public.business_reverification_cases enable row level security;
revoke all on table public.business_reverification_cases from public,anon,authenticated;
grant all on table public.business_reverification_cases to service_role;

create or replace function public.business_reverification_operations(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid()) then raise exception 'BUSINESS_ACCESS_DENIED'; end if;
 insert into public.business_reverification_cases(business_id,location_id,status,opened_at,updated_at)
 select p_business_id,l.id,'open',now(),now() from public.locations l join public.business_locations bl on bl.location_id=l.id and bl.business_id=p_business_id cross join lateral public.get_location_trust_quality(l.id) q
 where l.is_active=true and coalesce((q->>'needs_reverification')::boolean,false) and not exists(select 1 from public.business_reverification_cases c where c.business_id=p_business_id and c.location_id=l.id and c.status in('open','in_progress'));
 update public.business_reverification_cases c set status='resolved',resolved_at=now(),resolution_reason='canonical_trust_quality_cleared',resolution_snapshot=coalesce(public.get_location_trust_quality(c.location_id),'{}'::jsonb),updated_at=now()
 where c.business_id=p_business_id and c.status in('open','in_progress') and not coalesce((public.get_location_trust_quality(c.location_id)->>'needs_reverification')::boolean,true);
 select coalesce(jsonb_agg(to_jsonb(x) order by x.active_sort,x.priority_score desc,x.updated_at desc),'[]'::jsonb) into result from (
  select c.id case_id,c.business_id,c.location_id,l.name,c.status,c.assigned_to,c.qr_id,c.opened_at,c.assigned_at,c.resolved_at,c.dismissed_at,c.resolution_reason,c.resolution_snapshot,c.updated_at,q,
   case when c.status in('open','in_progress') then 0 else 1 end active_sort,
   (case when coalesce((q->>'contradiction_count')::int,0)>0 then 50 else 0 end + case when coalesce((q->>'stale')::boolean,false) then 30 else 0 end + case when coalesce((q->>'total_observations')::int,0)<2 then 20 else 0 end)::int priority_score,
   case when coalesce((q->>'contradiction_count')::int,0)>0 then 'resolve_conflict' when coalesce((q->>'stale')::boolean,false) then 'refresh_stale_evidence' when coalesce((q->>'needs_reverification')::boolean,false) then 'increase_evidence' else 'resolved' end suggested_action,
   case when c.assigned_to=auth.uid() then true else false end assigned_to_me
  from public.business_reverification_cases c join public.locations l on l.id=c.location_id cross join lateral public.get_location_trust_quality(c.location_id) q where c.business_id=p_business_id
 ) x;
 return jsonb_build_object('business_id',p_business_id,'cases',result,'generated_at',now());
end;$function$;

create or replace function public.business_manage_reverification_case(p_business_id uuid,p_case_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare c public.business_reverification_cases; q jsonb; a text:=lower(trim(coalesce(p_action,'')));
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 select * into c from public.business_reverification_cases where id=p_case_id and business_id=p_business_id for update;
 if c.id is null then raise exception 'Reverification case not found'; end if;
 q:=public.get_location_trust_quality(c.location_id);
 if a='assign_to_me' then update public.business_reverification_cases set status='in_progress',assigned_to=auth.uid(),assigned_at=coalesce(assigned_at,now()),dismissed_at=null,updated_at=now() where id=c.id;
 elsif a='release' then update public.business_reverification_cases set status='open',assigned_to=null,assigned_at=null,updated_at=now() where id=c.id and status<>'resolved';
 elsif a='dismiss' then update public.business_reverification_cases set status='dismissed',dismissed_at=now(),resolution_reason='dismissed_by_operator',updated_at=now() where id=c.id;
 elsif a='reopen' then if not coalesce((q->>'needs_reverification')::boolean,false) then raise exception 'Canonical trust quality no longer requires reverification'; end if; update public.business_reverification_cases set status='open',assigned_to=null,assigned_at=null,resolved_at=null,dismissed_at=null,resolution_reason=null,resolution_snapshot='{}'::jsonb,updated_at=now() where id=c.id;
 else raise exception 'Unsupported reverification action'; end if;
 return (select to_jsonb(x) from public.business_reverification_cases x where x.id=c.id);
end;$function$;

create or replace function public.business_create_reverification_qr(p_business_id uuid,p_location_id uuid)
returns public.qr_codes language plpgsql security definer set search_path to '' as $function$
declare v public.qr_codes; q jsonb; c_id uuid;
begin
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 if not exists(select 1 from public.business_locations where business_id=p_business_id and location_id=p_location_id) then raise exception 'Location does not belong to business'; end if;
 q:=public.get_location_trust_quality(p_location_id); if not coalesce((q->>'needs_reverification')::boolean,false) then raise exception 'Location does not currently need reverification'; end if;
 insert into public.business_reverification_cases(business_id,location_id,status,assigned_to,assigned_at,updated_at) values(p_business_id,p_location_id,'in_progress',auth.uid(),now(),now())
 on conflict (business_id,location_id) where status in ('open','in_progress') do update set status='in_progress',assigned_to=auth.uid(),assigned_at=coalesce(public.business_reverification_cases.assigned_at,now()),updated_at=now() returning id into c_id;
 v:=public.business_create_custom_qr(p_business_id,p_location_id,'Help reverify this restroom','trust_reverification','trust_mission',jsonb_build_object('location_id',p_location_id,'source','qr_reverification','priority',case when coalesce((q->>'contradiction_count')::int,0)>0 then 'high' else 'medium' end,'reverification_case_id',c_id),jsonb_build_object('frame_label','Help verify this restroom','cta_label','Scan to start a Kleenest trust mission'),false,null);
 update public.business_reverification_cases set qr_id=v.id,updated_at=now() where id=c_id; return v;
end;$function$;

create or replace function public.complete_reverification_trust_mission(p_review_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare m jsonb; q jsonb; v_id uuid; v_location uuid; v_before int; v_after int; v_cleared boolean;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select id,location_id,coalesce((goal->>'baseline_contradiction_count')::int,0) into v_id,v_location,v_before from public.user_trust_missions where user_id=auth.uid() and status='active' order by started_at desc limit 1;
 if v_id is null then raise exception 'No active trust mission'; end if;
 m:=public.complete_my_trust_mission(p_review_id); q:=public.get_location_trust_quality(v_location); v_after:=coalesce((q->>'contradiction_count')::int,0); v_cleared:=not coalesce((q->>'needs_reverification')::boolean,true);
 update public.user_trust_missions set completion_evidence=coalesce(completion_evidence,'{}'::jsonb)||jsonb_build_object('post_trust_quality',q,'reverification_cleared',v_cleared,'contradictions_before',v_before,'contradictions_after',v_after,'conflict_reduced',v_after<v_before),updated_at=now() where id=v_id and user_id=auth.uid();
 if v_cleared then update public.business_reverification_cases c set status='resolved',resolved_at=now(),resolution_reason='consumer_reverification_cleared',resolution_snapshot=q,updated_at=now() where c.location_id=v_location and c.status in('open','in_progress'); end if;
 return (select jsonb_build_object('id',x.id,'location_id',x.location_id,'location_name',l.name,'source',x.source,'status',x.status,'priority',x.priority,'goal',x.goal,'baseline_evidence',x.baseline_evidence,'completion_evidence',x.completion_evidence,'reward_points',x.reward_points,'started_at',x.started_at,'completed_at',x.completed_at) from public.user_trust_missions x join public.locations l on l.id=x.location_id where x.id=v_id);
end;$function$;

revoke all on function public.business_reverification_operations(uuid) from public,anon;
revoke all on function public.business_manage_reverification_case(uuid,uuid,text) from public,anon;
revoke all on function public.business_create_reverification_qr(uuid,uuid) from public,anon;
revoke all on function public.complete_reverification_trust_mission(uuid) from public,anon;
grant execute on function public.business_reverification_operations(uuid) to authenticated,service_role;
grant execute on function public.business_manage_reverification_case(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.business_create_reverification_qr(uuid,uuid) to authenticated,service_role;
grant execute on function public.complete_reverification_trust_mission(uuid) to authenticated,service_role;