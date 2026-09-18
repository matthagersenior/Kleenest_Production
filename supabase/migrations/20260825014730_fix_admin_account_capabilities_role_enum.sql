create or replace function public.admin_set_account_capabilities(p_target_user_id uuid, p_role text default null::text, p_subscription_tier text default null::text, p_is_business_user boolean default null::boolean, p_is_admin boolean default null::boolean, p_is_demo_test boolean default null::boolean, p_reason text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions', 'pg_temp'
as $function$
declare
  caller uuid := auth.uid();
  before_state jsonb;
  after_state jsonb;
begin
  if caller is null then raise exception 'authentication required'; end if;
  if not exists(select 1 from public.profiles where id=caller and is_platform_owner=true) then raise exception 'platform owner authorization required'; end if;
  if p_target_user_id is null then raise exception 'target user required'; end if;
  if p_target_user_id=caller and p_is_admin=false then raise exception 'cannot remove your own owner/admin access'; end if;

  select jsonb_build_object('role',role,'subscription_tier',subscription_tier,'is_business_user',is_business_user,'is_admin',is_admin,'is_platform_owner',is_platform_owner,'is_demo_test',is_demo_test)
    into before_state
    from public.profiles where id=p_target_user_id for update;
  if before_state is null then raise exception 'target profile not found'; end if;

  update public.profiles
    set role=case when p_role is null then role else p_role::public.account_role end,
        subscription_tier=case when p_subscription_tier is null then subscription_tier else p_subscription_tier::public.subscription_tier end,
        is_business_user=coalesce(p_is_business_user,is_business_user),
        is_admin=coalesce(p_is_admin,is_admin),
        is_demo_test=coalesce(p_is_demo_test,is_demo_test),
        updated_at=now()
    where id=p_target_user_id;

  select jsonb_build_object('role',role,'subscription_tier',subscription_tier,'is_business_user',is_business_user,'is_admin',is_admin,'is_platform_owner',is_platform_owner,'is_demo_test',is_demo_test)
    into after_state from public.profiles where id=p_target_user_id;

  insert into public.admin_capability_audit(admin_user_id,target_user_id,previous_state,new_state,reason)
    values(caller,p_target_user_id,before_state,after_state,coalesce(p_reason,'Admin account repair'));
  return after_state;
end;
$function$;
