-- Align Business photo-dispute categories with the canonical trust moderation taxonomy.
create or replace function public.business_photo_dispute_owner_queue()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_reason text;
begin
  v_reason:=case
    when lower(new.reason) like '%privacy%' then 'privacy'
    when lower(new.reason) like '%inappropriate%' or lower(new.reason) like '%explicit%' then 'explicit'
    when lower(new.reason) like '%relevance%'
      or lower(new.reason) in ('wrong location','outdated','misleading') then 'relevance'
    else 'other'
  end;

  perform public.queue_review_photo_report(
    new.review_photo_id,
    new.reporter_user_id,
    v_reason,
    concat_ws(E'\n',new.reason,new.details),
    new.business_id
  );
  return new;
end;
$$;

revoke all on function public.business_photo_dispute_owner_queue()
  from public,anon,authenticated;
grant execute on function public.business_photo_dispute_owner_queue()
  to service_role;
