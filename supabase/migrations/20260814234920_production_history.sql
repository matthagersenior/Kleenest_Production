drop function if exists public.join_contest(uuid);
create or replace function public.has_kleenest_premium()
returns boolean language sql security definer set search_path=public,auth as $$
  select case when auth.uid() is null then false
    when lower(coalesce((select email from auth.users where id=auth.uid()),''))='matthagersr@gmail.com' then true
    else coalesce((select (raw_user_meta_data->>'premiumEntitlement')='active' or (raw_user_meta_data->>'premiumOwnership')='lifetime' or lower(coalesce(raw_user_meta_data->>'subscriptionLevel','')) in ('premium','fleet','enterprise','business') from auth.users where id=auth.uid()),false)
  end;
$$;
create or replace function public.join_contest(p_contest_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare affected integer:=0;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 if not public.has_kleenest_premium() then raise exception 'premium_required'; end if;
 if not exists(select 1 from contests where id=p_contest_id and active and starts_at<=now() and ends_at>now()) then raise exception 'contest_unavailable'; end if;
 insert into contest_entries(contest_id,user_id) values(p_contest_id,auth.uid()) on conflict do nothing;
 get diagnostics affected=row_count;
 if affected>0 then perform award_gamification_points('contest_entry',jsonb_build_object('contest_id',p_contest_id)); end if;
 return jsonb_build_object('joined',true,'new_entry',affected>0);
end $$;
revoke all on function public.has_kleenest_premium() from public;
grant execute on function public.has_kleenest_premium() to authenticated;
revoke all on function public.join_contest(uuid) from public;
grant execute on function public.join_contest(uuid) to authenticated;
