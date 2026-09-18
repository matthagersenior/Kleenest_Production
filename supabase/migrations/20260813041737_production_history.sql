create or replace function public.partner_preferred_analytics(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now())
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_allowed boolean; v_result jsonb;
begin
 if v_user is null then raise exception 'not_authenticated'; end if;
 select exists(select 1 from public.business_members where business_id=p_business_id and user_id=v_user and role in ('owner','admin')) into v_allowed;
 if not v_allowed then raise exception 'business_admin_required'; end if;
 select jsonb_build_object(
  'business_id',p_business_id,
  'period_start',p_start,
  'period_end',p_end,
  'total_activations',(select count(*) from preferred_location_activations a join locations l on l.id=a.location_id where l.business_id=p_business_id and a.activated_at>=p_start and a.activated_at<=p_end),
  'active_activations',(select count(*) from preferred_location_activations a join locations l on l.id=a.location_id where l.business_id=p_business_id and a.deactivated_at is null),
  'total_uses',(select count(*) from preferred_usage_events e where e.business_id=p_business_id and e.occurred_at>=p_start and e.occurred_at<=p_end),
  'unique_users',(select count(distinct e.user_id) from preferred_usage_events e where e.business_id=p_business_id and e.occurred_at>=p_start and e.occurred_at<=p_end),
  'programs',(select coalesce(jsonb_agg(x order by x->>'program_name'),'[]'::jsonb) from (select jsonb_build_object('program_id',e.program_id,'program_name',p.name,'uses',count(*) ,'unique_users',count(distinct e.user_id)) x from preferred_usage_events e left join partner_programs p on p.id=e.program_id where e.business_id=p_business_id and e.occurred_at>=p_start and e.occurred_at<=p_end group by e.program_id,p.name) s),
  'locations',(select coalesce(jsonb_agg(x order by x->>'location_name'),'[]'::jsonb) from (select jsonb_build_object('location_id',e.location_id,'location_name',l.name,'uses',count(*),'unique_users',count(distinct e.user_id)) x from preferred_usage_events e join locations l on l.id=e.location_id where e.business_id=p_business_id and e.occurred_at>=p_start and e.occurred_at<=p_end group by e.location_id,l.name) s)
 ) into v_result;
 return v_result;
end;$$;
revoke execute on function public.partner_preferred_analytics(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.partner_preferred_analytics(uuid,timestamptz,timestamptz) to authenticated;
