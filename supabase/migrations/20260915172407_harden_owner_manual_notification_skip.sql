create or replace function internal.evaluate_platform_notification_rules()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rule record;
  v_requested uuid;
  v_owner_manual boolean:=false;
begin
  v_owner_manual:=
    lower(coalesce(new.actor_type,''))='platform'
    and new.actor_id is not null
    and public.is_platform_owner(new.actor_id)
    and lower(coalesce(new.payload->>'owner_initiated','false')) in ('true','t','1','yes')
    and lower(coalesce(new.payload->>'owner_manual_materialize','false')) in ('true','t','1','yes');

  if v_owner_manual then return new; end if;

  begin
    v_requested:=nullif(new.payload->>'platform_rule_id','')::uuid;
  exception when invalid_text_representation then
    v_requested:=null;
  end;

  for v_rule in
    select r.id
    from public.platform_notification_rules r
    where r.enabled=true
      and (r.starts_at is null or r.starts_at<=now())
      and (r.ends_at is null or r.ends_at>now())
      and (v_requested is null or r.id=v_requested)
      and (
        (r.match_mode='exact' and r.event_pattern=new.event_type)
        or (r.match_mode='prefix' and new.event_type like r.event_pattern||'%')
      )
  loop
    begin
      perform internal.materialize_platform_notification_rule(v_rule.id,new.id,'live_network',null,null);
    exception when others then
      null;
    end;
  end loop;

  return new;
end;
$$;

revoke all on function internal.evaluate_platform_notification_rules() from public,anon,authenticated;
