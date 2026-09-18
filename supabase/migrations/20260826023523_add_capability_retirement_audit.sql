create or replace function public.capability_retirement_audit(p_limit integer default 200)
returns table(function_signature text, domain text, classification text, db_dependency_count bigint, db_dependents text[], retirement_state text)
language sql
stable
as $$
with classified as (
  select p.oid, p.oid::regprocedure::text as signature, c.domain, c.classification
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  join public.capability_function_classifications c on c.function_signature=p.oid::regprocedure::text
  where n.nspname='public' and p.prokind='f'
), compat as (
  select * from classified where classification in ('compatibility','legacy')
), dep as (
  select c.oid,
         count(distinct d.classid::text||':'||d.objid::text||':'||d.objsubid::text) filter (where d.objid <> c.oid) as dep_count,
         array_remove(array_agg(distinct pg_describe_object(d.classid,d.objid,d.objsubid)) filter (where d.objid <> c.oid),null) as dependents
  from compat c
  left join pg_depend d on d.refclassid='pg_proc'::regclass and d.refobjid=c.oid and d.deptype in ('n','a')
  group by c.oid
)
select c.signature,c.domain,c.classification,
       coalesce(d.dep_count,0),coalesce(d.dependents,array[]::text[]),
       case when coalesce(d.dep_count,0)>0 then 'blocked_db_dependency' else 'candidate_pending_app_caller_audit' end
from compat c
left join dep d on d.oid=c.oid
order by case when coalesce(d.dep_count,0)>0 then 0 else 1 end,c.domain,c.signature
limit greatest(1,least(coalesce(p_limit,200),1000));
$$;
comment on function public.capability_retirement_audit(integer) is 'Owner architecture governance: identifies compatibility/legacy functions with PostgreSQL dependents before retirement; application caller search remains a separate gate.';
