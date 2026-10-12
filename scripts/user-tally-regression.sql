-- Run only after the tally migration. All synthetic records are rolled back.
begin;
do $$
declare
  owner_id uuid;
  ordinary_id uuid;
  synthetic_id uuid := gen_random_uuid();
  before_snapshot jsonb;
  after_snapshot jsonb;
  was_denied boolean := false;
begin
  select p.id into owner_id from public.profiles p join auth.users u on u.id=p.id
  where p.is_platform_owner and u.deleted_at is null limit 1;
  if owner_id is null then raise exception 'Owner fixture unavailable'; end if;
  if has_function_privilege('anon','public.owner_user_tally_snapshot()','execute') then raise exception 'Anonymous tally access exposed'; end if;
  if has_table_privilege('authenticated','private.user_tally_daily','select') then raise exception 'Raw tally table exposed'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  before_snapshot := public.owner_user_tally_snapshot();
  if (before_snapshot->>'current_accounts')::bigint <> (select count(*) from auth.users where not coalesce(is_anonymous,false) and deleted_at is null) then raise exception 'Current account count mismatch'; end if;
  -- Pick an account without a trusted platform role (the JWT metadata is not used).
  select u.id into ordinary_id from auth.users u left join public.profiles p on p.id=u.id
  where not coalesce(p.is_platform_owner,false) and not coalesce(p.is_admin,false)
  and coalesce(p.role::text,'') not in ('admin','platform_admin','super_admin') limit 1;
  if ordinary_id is not null then
    perform set_config('request.jwt.claim.sub',ordinary_id::text,true);
    begin perform public.owner_user_tally_snapshot(); exception when others then was_denied := true; end;
    if not was_denied then raise exception 'Ordinary account accessed owner tally'; end if;
  end if;
  insert into auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_anonymous)
  values(synthetic_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',synthetic_id::text||'@example.invalid','{}','{}',now(),now(),false);
  perform set_config('request.jwt.claim.sub',synthetic_id::text,true);
  perform public.record_app_activity(null);
  perform public.record_app_activity(null);
  if (select count(*) from private.user_tally_activity where user_id=synthetic_id)<>1 then raise exception 'Activity duplicated across calls'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  after_snapshot := public.owner_user_tally_snapshot();
  if (after_snapshot->>'current_accounts')::bigint<>(before_snapshot->>'current_accounts')::bigint+1 then raise exception 'Signup current count mismatch'; end if;
  if (after_snapshot->>'total_signups_recorded')::bigint<>(before_snapshot->>'total_signups_recorded')::bigint+1 then raise exception 'Signup lifecycle mismatch'; end if;
  if (after_snapshot->>'active_24h')::bigint<>(before_snapshot->>'active_24h')::bigint+1 then raise exception 'Active user dedupe failed'; end if;
  update auth.users set deleted_at=now() where id=synthetic_id;
  delete from auth.users where id=synthetic_id;
  after_snapshot := public.owner_user_tally_snapshot();
  if (after_snapshot->>'current_accounts')::bigint<>(before_snapshot->>'current_accounts')::bigint then raise exception 'Deletion current count mismatch'; end if;
  if (after_snapshot->>'deleted_accounts_recorded')::bigint<>(before_snapshot->>'deleted_accounts_recorded')::bigint+1 then raise exception 'Soft plus hard deletion double-counted'; end if;
  if exists(select 1 from private.user_tally_activity where user_id=synthetic_id) then raise exception 'Deleted activity retained'; end if;
end $$;
rollback;
select 'user tally lifecycle, dedupe, deletion erasure and authorization checks passed' as result;
