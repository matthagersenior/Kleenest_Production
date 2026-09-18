create or replace function public.process_intelligence_notification_jobs(p_limit integer default 50)
returns integer language plpgsql security definer set search_path=public as $$
declare v_job record; v_processed integer:=0; v_signal record; v_user uuid; v_type text; v_title text; v_body text; v_key text; v_recent boolean;
begin
 for v_job in select j.*,l.name location_name,l.business_id from public.intelligence_notification_jobs j join public.locations l on l.id=j.location_id where j.status='pending' and j.available_at<=now() order by j.created_at for update skip locked limit greatest(1,least(p_limit,200)) loop
  begin
   update public.intelligence_notification_jobs set status='processing',attempts=attempts+1 where id=v_job.id;
   select coalesce(s.confidence_score,0)::numeric quality_score,coalesce(s.check_in_count,0)::numeric checkins,coalesce(s.qr_check_in_count,0)::numeric qr_checkins,
     coalesce(s.last_verified_at,l.updated_at) last_verified_at,
     (select count(*) from public.live_network_events e where e.location_id=v_job.location_id and e.created_at>=now()-interval '2 hours')::numeric recent_events,
     (select count(*) from public.live_network_events e where e.location_id=v_job.location_id and e.event_type='location.conflict' and e.created_at>=now()-interval '2 hours')::numeric recent_conflicts,
     (select count(*) from public.live_network_events e where e.location_id=v_job.location_id and e.event_type='location.stale' and e.created_at>=now()-interval '2 hours')::numeric recent_stale
   into v_signal from public.location_feature_summary s right join public.locations l on l.id=v_job.location_id where s.location_id=v_job.location_id;
   if v_signal is null then update public.intelligence_notification_jobs set status='completed',processed_at=now(),last_error='No intelligence feature summary available' where id=v_job.id; v_processed:=v_processed+1; continue; end if;
   v_type:=null;
   if v_job.surface='business' then
    if v_signal.recent_conflicts>0 or v_signal.recent_stale>0 then v_type:='operational_attention';v_title:='Location needs attention';v_body:='Recent Kleenest network signals indicate this location may need verification or operational follow-up.';
    elsif v_signal.recent_events>=7 then v_type:='demand_opportunity';v_title:='Demand opportunity';v_body:='Kleenest is seeing elevated activity around this location.'; end if;
   elsif v_job.surface='fleet' then
    if v_signal.recent_events>=7 or v_signal.checkins+v_signal.qr_checkins>=10 then v_type:='high_activity_zone';v_title:='High-activity zone';v_body:='Recent demand and activity make this location an elevated operational waypoint.'; end if;
   else
    if v_signal.quality_score>=80 and v_signal.recent_stale=0 then v_type:='trusted_place';v_title:='Trusted place';v_body:='Strong current community confidence makes this a reliable place to consider.';
    elsif v_signal.recent_events>=7 then v_type:='popular_place';v_title:='Popular nearby';v_body:='This place is receiving elevated activity from the Kleenest network.'; end if;
   end if;
   if v_type is not null then
    if v_job.surface='business' then
     for v_user in select bm.user_id from public.business_members bm where bm.business_id=v_job.business_id loop
      v_key:=format('intelligence:%s:%s:%s:%s',v_job.surface,v_job.location_id,v_type,v_user); select exists(select 1 from public.intelligence_notification_deliveries d where d.user_id=v_user and d.dedupe_key=v_key and d.created_at>now()-interval '120 minutes') into v_recent;
      if not v_recent then insert into public.notifications(user_id,type,title,body,data) values(v_user,v_type,v_title,v_body,jsonb_build_object('surface',v_job.surface,'location_id',v_job.location_id,'location_name',v_job.location_name,'dedupe_key',v_key,'signals',jsonb_build_object('quality_score',v_signal.quality_score,'recent_events',v_signal.recent_events,'recent_conflicts',v_signal.recent_conflicts,'recent_stale',v_signal.recent_stale))); insert into public.intelligence_notification_deliveries(user_id,location_id,surface,notification_type,dedupe_key) values(v_user,v_job.location_id,v_job.surface,v_type,v_key); end if;
     end loop;
    elsif v_job.surface='fleet' then
     for v_user in select bm.user_id from public.business_members bm join public.businesses b on b.id=bm.business_id where bm.business_id=v_job.business_id and b.business_tier='fleet' loop
      v_key:=format('intelligence:%s:%s:%s:%s',v_job.surface,v_job.location_id,v_type,v_user); select exists(select 1 from public.intelligence_notification_deliveries d where d.user_id=v_user and d.dedupe_key=v_key and d.created_at>now()-interval '120 minutes') into v_recent;
      if not v_recent then insert into public.notifications(user_id,type,title,body,data) values(v_user,v_type,v_title,v_body,jsonb_build_object('surface',v_job.surface,'location_id',v_job.location_id,'location_name',v_job.location_name,'dedupe_key',v_key,'signals',jsonb_build_object('recent_events',v_signal.recent_events,'checkins',v_signal.checkins,'qr_checkins',v_signal.qr_checkins))); insert into public.intelligence_notification_deliveries(user_id,location_id,surface,notification_type,dedupe_key) values(v_user,v_job.location_id,v_job.surface,v_type,v_key); end if;
     end loop;
    else
     for v_user in select distinct x.user_id from (select f.user_id from public.favorites f where f.location_id=v_job.location_id union select f.user_id from public.location_favorites f where f.location_id=v_job.location_id union select lv.user_id from public.location_visits lv where lv.location_id=v_job.location_id and lv.occurred_at>=now()-interval '90 days') x join public.profiles p on p.id=x.user_id loop
      v_key:=format('intelligence:%s:%s:%s:%s',v_job.surface,v_job.location_id,v_type,v_user); select exists(select 1 from public.intelligence_notification_deliveries d where d.user_id=v_user and d.dedupe_key=v_key and d.created_at>now()-interval '120 minutes') into v_recent;
      if not v_recent then insert into public.notifications(user_id,type,title,body,data) values(v_user,v_type,v_title,v_body,jsonb_build_object('surface',v_job.surface,'location_id',v_job.location_id,'location_name',v_job.location_name,'dedupe_key',v_key,'signals',jsonb_build_object('quality_score',v_signal.quality_score,'recent_events',v_signal.recent_events))); insert into public.intelligence_notification_deliveries(user_id,location_id,surface,notification_type,dedupe_key) values(v_user,v_job.location_id,v_job.surface,v_type,v_key); end if;
     end loop;
    end if;
   end if;
   update public.intelligence_notification_jobs set status='completed',processed_at=now(),last_error=null where id=v_job.id; v_processed:=v_processed+1;
  exception when others then update public.intelligence_notification_jobs set status=case when attempts>=3 then 'failed' else 'pending' end,available_at=now()+interval '5 minutes',last_error=left(sqlerrm,1000) where id=v_job.id; end;
 end loop; return v_processed;
end; $$;
revoke all on function public.process_intelligence_notification_jobs(integer) from public,anon,authenticated; grant execute on function public.process_intelligence_notification_jobs(integer) to service_role;
