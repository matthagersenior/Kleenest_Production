
create or replace function public.owner_email_worker_enqueue_automation(
  p_title text,
  p_reason text,
  p_body text,
  p_details jsonb,
  p_dedupe_key text,
  p_severity text default 'warning',
  p_noteworthy boolean default true
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_owner uuid; v_id uuid; v_count integer:=0; v_severity text:=lower(coalesce(p_severity,'warning'));
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service role required'; end if;
  if v_severity not in ('info','warning','critical') then raise exception 'Invalid severity'; end if;
  for v_owner in select p.id from public.profiles p where coalesce(p.is_platform_owner,false)
  loop
    v_id:=internal.owner_email_enqueue(
      v_owner,'automation_delivery',v_severity,coalesce(p_noteworthy,true),
      left(coalesce(p_title,'Automation issue'),180),
      left(coalesce(p_reason,'An automation issue requires attention.'),1200),
      left(coalesce(p_body,''),4000),
      coalesce(p_details,'{}'::jsonb),
      left(coalesce(p_dedupe_key,'automation:'||gen_random_uuid()::text),240),
      now()
    );
    if v_id is not null then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end
$$;

revoke all on function public.owner_email_worker_enqueue_automation(text,text,text,jsonb,text,text,boolean) from public,anon,authenticated;
grant execute on function public.owner_email_worker_enqueue_automation(text,text,text,jsonb,text,text,boolean) to service_role;
