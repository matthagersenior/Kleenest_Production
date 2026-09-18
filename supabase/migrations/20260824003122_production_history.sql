alter table public.profiles add column if not exists is_platform_owner boolean not null default false;
update public.profiles set is_platform_owner=true where username='matthagersr';

create or replace function public.is_platform_owner(p_user_id uuid default auth.uid()) returns boolean
language sql stable security invoker set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=p_user_id and p.is_platform_owner=true);
$$;

create or replace function public.admin_authorization_v1(p_user_id uuid default auth.uid()) returns jsonb
language sql stable security invoker set search_path=public as $$
  select coalesce((select jsonb_build_object('authorized',coalesce(p.is_admin,false) or p.role::text in ('admin','owner','platform_admin','super_admin'),'role',p.role::text,'is_admin',p.is_admin,'is_platform_owner',p.is_platform_owner) from public.profiles p where p.id=p_user_id),jsonb_build_object('authorized',false,'role',null,'is_admin',false,'is_platform_owner',false));
$$;

create or replace function public.admin_set_user_access(p_target_user_id uuid,p_is_admin boolean default false,p_role text default 'customer',p_subscription_tier text default 'free',p_is_business_user boolean default false,p_reason text default 'Admin access change') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare old jsonb; result jsonb; caller uuid:=auth.uid(); normalized_tier text:=lower(trim(coalesce(p_subscription_tier,'free'))); normalized_role text:=lower(trim(coalesce(p_role,'customer'))); profile_role public.account_role;
begin
 if caller is null then raise exception 'authentication required'; end if;
 if not exists(select 1 from public.profiles where id=caller and is_platform_owner=true) then raise exception 'platform owner authorization required'; end if;
 if p_target_user_id is null then raise exception 'target user required'; end if;
 if p_target_user_id=caller and not p_is_admin then raise exception 'cannot remove your own owner/admin access'; end if;
 if normalized_role in ('business_owner','business') then normalized_role:='business'; elsif normalized_role in ('admin','owner','platform_admin','super_admin') then normalized_role:='admin'; elsif normalized_role='user' then normalized_role:='customer'; end if;
 if normalized_role not in ('customer','business','admin') then raise exception 'invalid role: %',normalized_role; end if;
 profile_role:=normalized_role::public.account_role;
 if normalized_tier in ('standard','growth') then normalized_tier:='premium'; end if;
 if normalized_tier not in ('free','premium','family','fleet','enterprise') then raise exception 'invalid subscription tier: %',normalized_tier; end if;
 select to_jsonb(p) into old from public.profiles p where p.id=p_target_user_id for update;
 if old is null then raise exception 'profile not found'; end if;
 update public.profiles set is_admin=p_is_admin, is_platform_owner=false, is_business_user=(p_is_business_user or normalized_role in ('business','admin')), role=profile_role, subscription_tier=normalized_tier::public.subscription_tier, updated_at=now() where id=p_target_user_id returning to_jsonb(profiles.*) into result;
 insert into public.admin_capability_audit(admin_user_id,target_user_id,previous_state,new_state,reason) values(caller,p_target_user_id,old,result,coalesce(nullif(trim(p_reason),''),'Admin access change'));
 return result;
end; $$;

create or replace function public.admin_set_account_capabilities(p_target_user_id uuid,p_role text default null,p_subscription_tier text default null,p_is_business_user boolean default null,p_is_admin boolean default null,p_is_demo_test boolean default null,p_reason text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare caller uuid:=auth.uid(); before_state jsonb; after_state jsonb;
begin
 if caller is null then raise exception 'authentication required'; end if;
 if not exists(select 1 from public.profiles where id=caller and is_platform_owner=true) then raise exception 'platform owner authorization required'; end if;
 if p_target_user_id is null then raise exception 'target user required'; end if;
 if p_target_user_id=caller and p_is_admin=false then raise exception 'cannot remove your own owner/admin access'; end if;
 select jsonb_build_object('role',role,'subscription_tier',subscription_tier,'is_business_user',is_business_user,'is_admin',is_admin,'is_platform_owner',is_platform_owner,'is_demo_test',is_demo_test) into before_state from public.profiles where id=p_target_user_id for update;
 if before_state is null then raise exception 'target profile not found'; end if;
 update public.profiles set role=case when p_role is null then role else p_role::public.app_role end,subscription_tier=case when p_subscription_tier is null then subscription_tier else p_subscription_tier::public.subscription_tier end,is_business_user=coalesce(p_is_business_user,is_business_user),is_admin=coalesce(p_is_admin,is_admin),is_demo_test=coalesce(p_is_demo_test,is_demo_test),updated_at=now() where id=p_target_user_id;
 select jsonb_build_object('role',role,'subscription_tier',subscription_tier,'is_business_user',is_business_user,'is_admin',is_admin,'is_platform_owner',is_platform_owner,'is_demo_test',is_demo_test) into after_state from public.profiles where id=p_target_user_id;
 insert into public.admin_capability_audit(admin_user_id,target_user_id,previous_state,new_state,reason) values(caller,p_target_user_id,before_state,after_state,coalesce(p_reason,'Admin account repair'));
 return after_state;
end; $$;

create or replace function public.admin_crud_gateway(p_resource text,p_action text,p_id uuid default null,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_table text:=lower(trim(p_resource)); v_action text:=lower(trim(p_action)); v_sql text; v_result jsonb; v_cols text; v_sets text; v_readonly boolean:=false;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if not exists(select 1 from profiles where id=auth.uid() and is_platform_owner=true) then raise exception 'platform owner authorization required'; end if;
 if v_table not in ('profiles','businesses','locations','location_hours','amenities','location_amenities','location_fixtures','location_photos','qr_codes','check_ins','reviews','review_photos','review_likes','review_amenity_feedback','favorites','follows','social_posts','social_post_likes','social_post_comments','social_post_saves','social_post_reports','social_activity','reports','badges','user_badges','point_transactions','level_definitions','user_streaks','progression_actions','progression_games','progression_challenges','social_challenge_entries','progression_metric_events','business_campaigns','business_events','event_rsvps','contests','contest_entries','promotions','promotion_redemptions','partner_programs','partner_agreements','partner_program_locations','partner_program_memberships','membership_clubs','club_memberships','single_use_access_offers','single_use_access_purchases','business_certifications','certification_tiers','enterprise_partner_networks','enterprise_partner_network_members','enterprise_partner_network_metrics','enterprise_partner_campaigns','enterprise_partner_outcomes','enterprise_partner_allocations','business_engagement_attributions','business_metric_leaderboards','analytics_events','preferred_location_activations','preferred_usage_events','location_visits','location_bathroom_verifications','location_verification_points','support_requests','user_feedback','account_deletion_requests','admin_capability_audit','demo_identity_registry','subscription_plans','subscriptions','pricing_catalog','app_business_memberships','business_overview','community_leaderboard','contest_leaderboards','partner_preferred_usage_analytics','preferred_business_analytics','public_locations','public_profiles','user_progression_metric_summary','notifications','messages','route_events','route_plans','route_stops','family_groups','family_members') then raise exception 'admin resource not allowed: %',p_resource; end if;
 if v_table='profiles' then v_readonly:=true; end if;
 if v_table in ('subscriptions','admin_capability_audit','account_deletion_requests','analytics_events','progression_metric_events','point_transactions','user_streaks','social_activity','notifications','messages','app_business_memberships','business_overview','community_leaderboard','contest_leaderboards','partner_preferred_usage_analytics','preferred_business_analytics','public_locations','public_profiles','user_progression_metric_summary','event_rsvps','family_groups','family_members','route_events','route_plans','route_stops','enterprise_partner_networks','enterprise_partner_network_members','enterprise_partner_network_metrics','enterprise_partner_campaigns','enterprise_partner_outcomes','enterprise_partner_allocations','business_certifications','business_engagement_attributions','business_metric_leaderboards','preferred_location_activations','preferred_usage_events','location_visits','location_bathroom_verifications','location_verification_points','single_use_access_purchases','promotion_redemptions','contest_entries','partner_agreements','partner_program_locations','partner_program_memberships','club_memberships','user_badges','social_post_likes','social_post_comments','social_post_saves','social_post_reports','review_likes','review_photos','review_amenity_feedback') then v_readonly:=true; end if;
 if v_action not in ('list','get','create','update','delete') then raise exception 'admin action not allowed: %',p_action; end if;
 if v_action in ('create','update','delete') and v_readonly then raise exception 'resource is read-only; use its protected Admin operation'; end if;
 if v_action='list' then v_sql:=format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from (select * from public.%I limit 200) x',v_table); execute v_sql into v_result; return v_result; end if;
 if v_action='get' then if p_id is null then raise exception 'record id required'; end if; v_sql:=format('select to_jsonb(x) from (select * from public.%I where id=$1 limit 1) x',v_table); execute v_sql into v_result using p_id; if v_result is null then raise exception 'record not found'; end if; return v_result; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'payload must be a JSON object'; end if;
 if v_action='delete' then if p_id is null then raise exception 'record id required'; end if; v_sql:=format('delete from public.%I where id=$1 returning to_jsonb(%I.*)',v_table,v_table); execute v_sql into v_result using p_id; if v_result is null then raise exception 'record not found'; end if; return v_result; end if;
 if v_action='update' and p_id is null then raise exception 'record id required'; end if;
 select string_agg(format('%I',key),', ' order by key), string_agg(format('%I = r.%I',key,key),', ' order by key) into v_cols,v_sets from jsonb_object_keys(p_payload) key where key<>'id';
 if v_cols is null then raise exception 'no editable fields supplied'; end if;
 if v_action='create' then v_sql:=format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) returning to_jsonb(%I.*)',v_table,v_cols,v_cols,v_table,v_table); execute v_sql into v_result using p_payload; return v_result; end if;
 v_sql:=format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 returning to_jsonb(t.*)',v_table,v_sets,v_table); execute v_sql into v_result using p_payload,p_id; if v_result is null then raise exception 'record not found'; end if; return v_result;
end; $$;
revoke execute on function public.admin_crud_gateway(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_crud_gateway(text,text,uuid,jsonb) to authenticated;
revoke execute on function public.admin_set_user_access(uuid,boolean,text,text,boolean,text) from public,anon;
grant execute on function public.admin_set_user_access(uuid,boolean,text,text,boolean,text) to authenticated;
revoke execute on function public.admin_set_account_capabilities(uuid,text,text,boolean,boolean,boolean,text) from public,anon;
grant execute on function public.admin_set_account_capabilities(uuid,text,text,boolean,boolean,boolean,text) to authenticated;
