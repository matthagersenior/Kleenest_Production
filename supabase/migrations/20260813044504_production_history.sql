create or replace function public.provision_demo_membership_after_profile()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
 if coalesce(new.is_demo_test,false) then
   perform public.ensure_current_user_demo_membership();
 end if;
 return new;
end;
$$;
drop trigger if exists trg_profiles_demo_membership on public.profiles;
create trigger trg_profiles_demo_membership
after insert or update of is_demo_test on public.profiles
for each row execute function public.provision_demo_membership_after_profile();
