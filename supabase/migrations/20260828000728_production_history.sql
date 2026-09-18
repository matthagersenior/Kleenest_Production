revoke execute on function public.fleet_observe_access(uuid) from anon;
grant execute on function public.fleet_observe_access(uuid) to authenticated;
comment on function public.fleet_observe_access(uuid) is 'Fleet read/workspace access. Any authenticated member of a Fleet or Enterprise business may observe shared fleet resources; mutation authority remains separately enforced by fleet_actor_is_manager/fleet_metric_controller_authorized. Anonymous execution is explicitly denied.';
