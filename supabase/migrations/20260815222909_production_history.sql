create or replace function public.business_location_metrics(p_business_id uuid, p_location_id uuid, p_dataset text, p_start timestamptz default now() - interval '30 days', p_end timestamptz default now()) returns jsonb language plpgsql security invoker as $$
declare r jsonb;
begin
  if p_dataset = 'overview' then
    select jsonb_build_object(
      'views', coalesce((select count(*) from public.location_visits v where v.location_id=p_location_id and v.occurred_at between p_start and p_end),0),
      'check_ins', coalesce((select count(*) from public.check_ins c where c.location_id=p_location_id and c.checked_in_at between p_start and p_end),0),
      'reviews', coalesce((select count(*) from public.reviews rv where rv.location_id=p_location_id and rv.created_at between p_start and p_end),0),
      'qr_scans', coalesce((select count(*) from public.qr_codes q where q.location_id=p_location_id and q.created_at <= p_end),0)
    ) into r;
  elsif p_dataset='engagement' then
    select jsonb_build_object('visits',count(*),'check_ins',(select count(*) from public.check_ins c where c.location_id=p_location_id and c.checked_in_at between p_start and p_end),'reviews',(select count(*) from public.reviews rv where rv.location_id=p_location_id and rv.created_at between p_start and p_end),'unique_users',(select count(distinct c.user_id) from public.check_ins c where c.location_id=p_location_id and c.checked_in_at between p_start and p_end)) into r from public.location_visits v where v.location_id=p_location_id and v.occurred_at between p_start and p_end;
  elsif p_dataset in ('qr','visitors') then
    select jsonb_build_object('qr_scans',(select count(*) from public.qr_codes q where q.location_id=p_location_id and q.created_at <= p_end),'check_ins',(select count(*) from public.check_ins c where c.location_id=p_location_id and c.checked_in_at between p_start and p_end),'unique_users',(select count(distinct c.user_id) from public.check_ins c where c.location_id=p_location_id and c.checked_in_at between p_start and p_end),'visits',(select count(*) from public.location_visits v where v.location_id=p_location_id and v.occurred_at between p_start and p_end)) into r;
  elsif p_dataset='reviews' then
    select jsonb_build_object('reviews',count(*),'average_rating',coalesce(avg(stars),0),'average_cleanliness_pct',coalesce(avg(cleanliness_pct),0),'published_reviews',count(*) filter(where status::text='published'),'business_replies',count(*) filter(where business_reply is not null and length(trim(business_reply))>0)) into r from public.reviews where location_id=p_location_id and created_at between p_start and p_end;
  elsif p_dataset='photos' then
    r=jsonb_build_object('photos',0,'vr_media',0,'locations_with_media',1,'period_uploads',0);
  elsif p_dataset='promotions' then
    select jsonb_build_object('promotions',count(*),'active_promotions',count(*) filter(where active=true and (ends_at is null or ends_at>=p_start)),'promotion_views',0,'redemptions',0,'unique_redeemers',0,'conversion_rate_pct',0) into r from public.promotions where business_id=p_business_id and location_id=p_location_id and created_at between p_start and p_end;
  elsif p_dataset='campaigns' then
    select jsonb_build_object('campaigns',count(*),'active_campaigns',count(*) filter(where status='active'),'outcome_visits',0,'outcome_check_ins',0,'outcome_reviews',0,'attributed_users',0,'points_awarded',0) into r from public.business_campaigns where business_id=p_business_id and location_id=p_location_id and created_at between p_start and p_end;
  elsif p_dataset='events' then
    select jsonb_build_object('events',count(*),'rsvps',0,'event_views',0,'event_rsvps_tracked',0) into r from public.business_events where business_id=p_business_id and location_id=p_location_id and created_at between p_start and p_end;
  elsif p_dataset='contests' then
    select jsonb_build_object('contests',count(*),'active_contests',count(*) filter(where status='active')) into r from public.contests where business_id=p_business_id and created_at between p_start and p_end;
  elsif p_dataset='occupancy' then
    select jsonb_build_object('visits',count(*),'check_ins',(select count(*) from public.check_ins c where c.location_id=p_location_id and c.checked_in_at between p_start and p_end),'unique_visitors',(select count(distinct c.user_id) from public.check_ins c where c.location_id=p_location_id and c.checked_in_at between p_start and p_end),'peak_hour',(select extract(hour from v2.occurred_at)::int from public.location_visits v2 where v2.location_id=p_location_id and v2.occurred_at between p_start and p_end group by extract(hour from v2.occurred_at) order by count(*) desc limit 1)) into r from public.location_visits v where v.location_id=p_location_id and v.occurred_at between p_start and p_end;
  elsif p_dataset='growth' then
    select jsonb_build_object('check_ins',count(*),'unique_users',count(distinct c.user_id),'reviews',(select count(*) from public.reviews rv where rv.location_id=p_location_id and rv.created_at between p_start and p_end),'new_users',count(distinct c.user_id)) into r from public.check_ins c where c.location_id=p_location_id and c.checked_in_at between p_start and p_end;
  elsif p_dataset='verification' then
    select jsonb_build_object('bathroom_verification_status',l.bathroom_verification_status,'bathroom_verification_count',coalesce(l.bathroom_verification_count,0),'bathroom_positive_count',coalesce(l.bathroom_positive_count,0),'bathroom_negative_count',coalesce(l.bathroom_negative_count,0),'verification_source',l.bathroom_verification_source) into r from public.locations l where l.id=p_location_id and l.business_id=p_business_id;
  elsif p_dataset='tier' then
    select jsonb_build_object('business_tier',b.business_tier::text,'location_count',(select count(*) from public.locations l where l.business_id=p_business_id and l.is_active is distinct from false),'verification_status',b.verification_status::text) into r from public.businesses b where b.id=p_business_id;
  else
    r=jsonb_build_object('message','This dataset uses business-level intelligence and is not reducible to a duplicate location KPI.','location_id',p_location_id);
  end if;
  return coalesce(r,'{}'::jsonb);
end; $$;

create or replace function public.business_reply_review(p_business_id uuid,p_review_id uuid,p_reply text) returns jsonb language plpgsql security invoker as $$
declare r public.reviews;
begin
 update public.reviews rv set business_reply=trim(p_reply), business_replied_at=case when nullif(trim(p_reply),'') is null then null else now() end, updated_at=now() where rv.id=p_review_id and rv.location_id in (select l.id from public.locations l where l.business_id=p_business_id);
 if not found then raise exception 'Review not found or not owned by this business'; end if;
 select * into r from public.reviews where id=p_review_id;
 return to_jsonb(r);
end; $$;
