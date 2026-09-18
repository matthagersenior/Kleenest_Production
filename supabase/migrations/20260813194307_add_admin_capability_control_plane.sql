create table if not exists public.admin_capability_audit (
 id uuid primary key default gen_random_uuid(),
 admin_user_id uuid not null references auth.users(id) on delete restrict,
 target_user_id uuid not null references auth.users(id) on delete cascade,
 previous_state jsonb not null default '{}'::jsonb,
 new_state jsonb not null default '{}'::jsonb,
 reason text,
 created_at timestamptz not null default now()
);

create or replace function public.admin_set_account_capabilities(
 p_target_user_id uuid,
 p_role text default null,
 p_subscription_tier text default null,
 p_is_business_user boolean default null,
 p_is_admin boolean default null,
 p_is_demo_test boolean default null,
 p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
 caller uuid := auth.uid();
 before_state jsonb;
 after_state jsonb;
begin
 if caller is null then raise exception 'authentication required'; end if;
 if not exists (select 1 from public.profiles where id=caller and is_admin=true) then raise exception 'admin authorization required'; end if;
 if p_target_user_id is null then raise exception 'target user required'; end if;
 select jsonb_build_object('role',role,'subscription_tier',subscription_tier,'is_business_user',is_business_user,'is_admin',is_admin,'is_demo_test',is_demo_test)
 into before_state from public.profiles where id=p_target_user_id for update;
 if before_state is null then raise exception 'target profile not found'; end if;
 update public.profiles set
   role=case when p_role is null then role else p_role::public.app_role end,
   subscription_tier=case when p_subscription_tier is null then subscription_tier else p_subscription_tier::public.subscription_tier end,
   is_business_user=coalesce(p_is_business_user,is_business_user),
   is_admin=coalesce(p_is_admin,is_admin),
   is_demo_test=coalesce(p_is_demo_test,is_demo_test),
   updated_at=now()
 where id=p_target_user_id;
 select jsonb_build_object('role',role,'subscription_tier',subscription_tier,'is_business_user',is_business_user,'is_admin',is_admin,'is_demo_test',is_demo_test)
 into after_state from public.profiles where id=p_target_user_id;
 insert into public.admin_capability_audit(admin_user_id,target_user_id,previous_state,new_state,reason)
 values(caller,p_target_user_id,before_state,after_state,p_reason);
 return after_state;
end;
$$;
revoke all on function public.admin_set_account_capabilities(uuid,text,text,boolean,boolean,boolean,text) from public, anon, authenticated;
grant execute on function public.admin_set_account_capabilities(uuid,text,text,boolean,boolean,boolean,text) to authenticated;

alter table public.admin_capability_audit enable row level security;
revoke all on public.admin_capability_audit from anon, authenticated;
create policy admin_capability_audit_admin_read on public.admin_capability_audit for select to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
