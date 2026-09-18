insert into public.capability_function_classifications(function_signature,domain,classification,rationale)
select
  p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as function_signature,
  case
    when p.proname like 'owner_progression_%' or p.proname='owner_maintain_progression_supply' then 'owner_progression'
    when p.proname like 'admin_%' or p.proname like 'owner_%' then 'owner_admin'
    when p.proname like 'qr_studio_%' or p.proname like 'business_%qr%' then 'business_qr'
    when p.proname like 'business_%' or p.proname like 'get_business_%' or p.proname like 'configure_business_%' or p.proname like 'confirm_business_%' then 'business'
    when p.proname like 'fleet_%' or p.proname like '%route_stop%' or p.proname in ('arrive_route_stop','arrive_active_route_stop','set_route_plan_geometry') then 'fleet'
    when p.proname like 'community_%' or p.proname like '%follow%' or p.proname like 'create_social_%' or p.proname='enforce_direct_message_block' then 'community'
    when p.proname like 'consumer_%' or p.proname like 'mobile_%' or p.proname like 'my_%' or p.proname in ('submit_support_request','cancel_my_trust_mission','start_my_trust_mission','complete_my_trust_mission') then 'consumer'
    when p.proname like '%progression%' or p.proname like 'quest_%' or p.proname like 'game_%' or p.proname like 'award_%badge%' then 'progression'
    when p.proname like '%notification%' or p.proname like '%push%' then 'notifications'
    when p.proname like '%ingestion%' or p.proname like 'reporting_%' or p.proname like 'run_%scheduler%' then 'platform_operations'
    when p.proname like '%review%' then 'reviews'
    when p.proname like '%location%' or p.proname like '%restroom%' or p.proname like '%discovery%' or p.proname like 'map_network_%' or p.proname like '%reverification%' then 'trust_discovery'
    else 'platform_support'
  end as domain,
  case
    when p.prorettype = 'trigger'::regtype then 'trigger_helper'
    when p.proname like '\_%' escape '\' or p.proname in ('get_internal_scheduler_secret','get_push_worker_secret','is_platform_owner_session') then 'supporting'
    when p.proname like '%\_authorized' escape '\' or p.proname like 'enforce_%' or p.proname like 'validate_%' or p.proname like 'notify_%' or p.proname like 'materialize_%' or p.proname like 'converge_%' or p.proname like 'sync_%' or p.proname like 'recompute_%' or p.proname like 'refresh_%' or p.proname like 'award_%' or p.proname like 'process_%' or p.proname like 'reporting_%' or p.proname like 'run_%scheduler%' or p.proname like 'maintain_%' or p.proname like 'evaluate_%' or p.proname like 'audit_%' or p.proname like 'project_%' or p.proname like 'rank_%' or p.proname like 'record_progression_event_%' or p.proname='quest_dispatch_event' then 'supporting'
    else 'canonical'
  end as classification,
  case
    when p.prorettype = 'trigger'::regtype then 'Database trigger helper; intentionally hidden from application UI.'
    when p.proname like '\_%' escape '\' or p.proname in ('get_internal_scheduler_secret','get_push_worker_secret','is_platform_owner_session') then 'Internal platform helper classified as supporting; intentionally hidden from application UI.'
    when p.proname like '%\_authorized' escape '\' or p.proname like 'enforce_%' or p.proname like 'validate_%' or p.proname like 'notify_%' or p.proname like 'materialize_%' or p.proname like 'converge_%' or p.proname like 'sync_%' or p.proname like 'recompute_%' or p.proname like 'refresh_%' or p.proname like 'award_%' or p.proname like 'process_%' or p.proname like 'reporting_%' or p.proname like 'run_%scheduler%' or p.proname like 'maintain_%' or p.proname like 'evaluate_%' or p.proname like 'audit_%' or p.proname like 'project_%' or p.proname like 'rank_%' or p.proname like 'record_progression_event_%' or p.proname='quest_dispatch_event' then 'Supporting server authority or automation; exposed through a canonical user-facing capability rather than directly as UI.'
    else 'Canonical callable capability inventoried for explicit app/route/action ownership and parity verification.'
  end as rationale
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
and not exists (
  select 1 from public.capability_function_classifications c
  where split_part(c.function_signature,'(',1)=p.proname
)
on conflict(function_signature) do nothing;
