drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create or replace function public.update_my_profile(p_display_name text default null,p_username text default null,p_avatar_url text default null,p_bio text default null)
returns public.profiles language plpgsql security invoker set search_path=public
as $$ declare v public.profiles; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 update public.profiles set display_name=coalesce(p_display_name,display_name),username=coalesce(p_username,username),avatar_url=coalesce(p_avatar_url,avatar_url),bio=coalesce(p_bio,bio),updated_at=now() where id=auth.uid() returning * into v; return v;
end; $$;
revoke execute on function public.update_my_profile(text,text,text,text) from public; grant execute on function public.update_my_profile(text,text,text,text) to authenticated;

revoke insert,update,delete on public.subscriptions from authenticated;
drop policy if exists subscriptions_own_insert on public.subscriptions;
drop policy if exists subscriptions_own_update on public.subscriptions;
drop policy if exists subscriptions_business_member_insert on public.subscriptions;
drop policy if exists subscriptions_business_member_update on public.subscriptions;
