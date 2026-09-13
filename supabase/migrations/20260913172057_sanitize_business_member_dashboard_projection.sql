
create or replace function public.business_dashboard_secure_summary(
  p_business_id uuid,
  p_start timestamptz default now()-interval '30 days',
  p_end timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_summary jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if not public.business_can_manage(p_business_id)
     and not exists(
       select 1
       from public.business_members bm
       where bm.business_id=p_business_id
         and bm.user_id=auth.uid()
     ) then
    raise exception 'Not authorized for this business';
  end if;

  select coalesce(
    jsonb_object_agg(a.event_type,a.event_count),
    '{}'::jsonb
  )
  into v_summary
  from (
    select ae.event_type::text event_type,count(*)::bigint event_count
    from public.analytics_events ae
    where ae.business_id=p_business_id
      and ae.created_at>=p_start
      and ae.created_at<p_end
    group by ae.event_type
  ) a;

  select jsonb_build_object(
    'business',(
      select jsonb_build_object(
        'id',b.id,
        'name',b.name,
        'description',b.description,
        'website',b.website,
        'phone',b.phone,
        'email',b.email,
        'logo_url',b.logo_url,
        'business_tier',b.business_tier::text,
        'verification_status',b.verification_status::text,
        'created_at',b.created_at,
        'updated_at',b.updated_at
      )
      from public.businesses b
      where b.id=p_business_id
    ),
    'locations',coalesce((
      select jsonb_agg(
        (
          public.mobile_location_detail_v1(l.id)
          - array[
              'business','photos','promotions','intelligence',
              'feature_summary','hours'
            ]::text[]
        )
        order by l.created_at
      )
      from public.locations l
      where coalesce(l.claimed_business_id,l.business_id)=p_business_id
    ),'[]'::jsonb),
    'summary',v_summary,
    'reviews',(
      select count(*)
      from public.reviews r
      join public.locations l on l.id=r.location_id
      where coalesce(l.claimed_business_id,l.business_id)=p_business_id
        and r.created_at>=p_start
        and r.created_at<p_end
    ),
    'check_ins',(
      select count(*)
      from public.check_ins c
      join public.locations l on l.id=c.location_id
      where coalesce(l.claimed_business_id,l.business_id)=p_business_id
        and c.checked_in_at>=p_start
        and c.checked_in_at<p_end
    ),
    'redemptions',(
      select count(*)
      from public.promotion_redemptions pr
      join public.locations l on l.id=pr.location_id
      where coalesce(l.claimed_business_id,l.business_id)=p_business_id
        and pr.redeemed_at>=p_start
        and pr.redeemed_at<p_end
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.business_dashboard_secure_summary(uuid,timestamptz,timestamptz)
  from public,anon;
grant execute on function public.business_dashboard_secure_summary(uuid,timestamptz,timestamptz)
  to authenticated,service_role;
