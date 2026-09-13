
do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname=any(array[
        'business_growth_analytics',
        'business_summary_analytics',
        'partner_preferred_analytics'
      ])
  loop
    v_def:=pg_get_functiondef(r.oid);
    v_new:=replace(
      v_def,
      'from locations where business_id=p_business_id',
      'from locations where coalesce(claimed_business_id,business_id)=p_business_id'
    );
    v_new:=replace(
      v_new,
      'from public.locations where business_id=p_business_id',
      'from public.locations where coalesce(claimed_business_id,business_id)=p_business_id'
    );
    if v_new is distinct from v_def then execute v_new; end if;
  end loop;
end $$;

create or replace function public.converge_qr_attribution_to_intelligence()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_feature_event_id uuid;
  v_notification_id uuid;
  v_event_type text:=lower(coalesce(new.action_type,'scan'));
  v_subject_type text;
  v_subject_id uuid;
  v_dedupe text;
begin
  if new.user_id is null then return new; end if;

  v_subject_type:=case
    when new.location_id is not null then 'location'
    when new.business_id is not null then 'business'
    else 'user'
  end;
  v_subject_id:=coalesce(new.location_id,new.business_id,new.user_id);
  v_dedupe:=md5(concat_ws(
    '|','qr_attribution_events',new.id::text,'qr_'||v_event_type
  ));

  insert into public.data_feature_events(
    subject_type,subject_id,actor_user_id,business_id,location_id,fleet_vehicle_id,
    event_type,feature_code,source_table,source_id,value_numeric,value_text,
    metadata,occurred_at,event_validity,confidence,deduplication_key,rate_limit_context
  )
  values(
    v_subject_type,v_subject_id,new.user_id,new.business_id,new.location_id,null,
    'qr_'||v_event_type,'business.qr.engagement','qr_attribution_events',new.id,
    null,v_event_type,
    coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
      'qr_code_id',new.qr_code_id,
      'campaign_id',new.campaign_id,
      'promotion_id',new.promotion_id,
      'engagement_program_id',new.engagement_program_id,
      'server_event_id',new.id,
      'intelligence_authority','qr_attribution_trigger'
    ),
    coalesce(new.created_at,now()),'valid',1,v_dedupe,
    jsonb_build_object('minute',date_trunc('minute',coalesce(new.created_at,now())))
  )
  on conflict do nothing
  returning id into v_feature_event_id;

  if v_feature_event_id is null then
    select e.id into v_feature_event_id
    from public.data_feature_events e
    where e.source_table='qr_attribution_events'
      and e.source_id=new.id
      and e.event_type='qr_'||v_event_type
    limit 1;
  end if;

  if new.location_id is not null
     and v_event_type in ('scan','checkin','redemption','redeem','engagement') then
    begin
      v_notification_id:=public.publish_intelligence_location_event(
        p_location_id:=new.location_id,
        p_event_type:='qr_'||v_event_type,
        p_title:='Kleenest engagement recorded',
        p_body:='A QR engagement signal was recorded for this location.',
        p_payload:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
          'business_id',new.business_id,
          'qr_code_id',new.qr_code_id,
          'qr_event_id',new.id,
          'feature_event_id',v_feature_event_id,
          'event_type',v_event_type
        ),
        p_radius_m:=500,
        p_dedupe_key:='qr:'||new.id::text
      );
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.converge_qr_attribution_to_intelligence()
  from public,anon,authenticated;
grant execute on function public.converge_qr_attribution_to_intelligence()
  to service_role;
