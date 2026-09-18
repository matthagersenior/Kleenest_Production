create or replace function public.record_feature_access(
  p_feature_code text,
  p_outcome text,
  p_tier_code text default null,
  p_destination text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;
  if not exists (select 1 from public.feature_catalog where feature_code=p_feature_code and enabled) then
    raise exception 'unknown or disabled feature';
  end if;
  if p_outcome not in ('allowed','locked','denied') then
    raise exception 'invalid feature access outcome';
  end if;
  insert into public.feature_access_events(user_id,feature_code,outcome,tier_code,destination,metadata)
  values ((select auth.uid()),p_feature_code,p_outcome,p_tier_code,p_destination,coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.record_feature_access(text,text,text,text,jsonb) from anon;
grant execute on function public.record_feature_access(text,text,text,text,jsonb) to authenticated;
