
create table if not exists public.review_photo_storage_moderation_jobs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.review_photo_reports(id) on delete set null,
  review_photo_id uuid references public.review_photos(id) on delete set null,
  bucket_id text not null default 'review-photos'
    check (bucket_id = 'review-photos'),
  object_path text not null,
  action text not null default 'delete'
    check (action = 'delete'),
  reason text not null
    check (reason in ('privacy','explicit')),
  status text not null default 'queued'
    check (status in ('queued','processing','completed','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  requested_by uuid references auth.users(id) on delete set null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists review_photo_storage_moderation_jobs_photo_action_uidx
  on public.review_photo_storage_moderation_jobs(review_photo_id,action,object_path)
  where review_photo_id is not null;

create index if not exists review_photo_storage_moderation_jobs_queue_idx
  on public.review_photo_storage_moderation_jobs(status,created_at)
  where status in ('queued','failed');

alter table public.review_photo_storage_moderation_jobs enable row level security;
revoke all on table public.review_photo_storage_moderation_jobs from public, anon, authenticated;
grant select,insert,update,delete on table public.review_photo_storage_moderation_jobs to service_role;

create or replace function public.claim_review_photo_storage_moderation_jobs(p_limit integer default 20)
returns table(
  id uuid,
  bucket_id text,
  object_path text,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'service_role required' using errcode='42501';
  end if;

  return query
  with picked as (
    select j.id
    from public.review_photo_storage_moderation_jobs j
    where j.status in ('queued','failed')
      and j.attempts < 5
    order by j.created_at,j.id
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),100))
  ), claimed as (
    update public.review_photo_storage_moderation_jobs j
       set status='processing',
           attempts=j.attempts+1,
           last_error=null,
           updated_at=now()
      from picked
     where j.id=picked.id
    returning j.id,j.bucket_id,j.object_path,j.attempts
  )
  select c.id,c.bucket_id,c.object_path,c.attempts
  from claimed c;
end;
$$;

revoke all on function public.claim_review_photo_storage_moderation_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_review_photo_storage_moderation_jobs(integer) to service_role;

create or replace function public.admin_resolve_review_photo_report(
  p_report_id uuid,
  p_status text,
  p_resolution text default 'no_action',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_status text:=lower(trim(coalesce(p_status,'')));
  v_resolution text:=lower(trim(coalesce(p_resolution,'no_action')));
  v_report public.review_photo_reports;
  v_photo_path text;
  v_storage_job_id uuid;
  v_storage_state text:='none';
begin
  if v_uid is null or not (
    public.is_platform_owner_session()
    or exists(select 1 from public.profiles p where p.id=v_uid and p.is_admin=true)
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  if v_status not in ('reviewing','resolved','dismissed') then
    raise exception 'PHOTO_REPORT_STATUS_INVALID';
  end if;
  if v_resolution not in ('hide','restore','no_action') then
    raise exception 'PHOTO_REPORT_RESOLUTION_INVALID';
  end if;

  select * into v_report
  from public.review_photo_reports
  where id=p_report_id
  for update;
  if v_report.id is null then raise exception 'PHOTO_REPORT_NOT_FOUND'; end if;

  if v_resolution='hide' then
    update public.review_photos
       set moderation_status='hidden'
     where id=v_report.review_photo_id
    returning storage_path into v_photo_path;

  elsif v_resolution='restore' then
    if exists(
      select 1
      from public.review_photo_storage_moderation_jobs j
      where j.review_photo_id=v_report.review_photo_id
        and j.action='delete'
        and j.status='completed'
    ) then
      raise exception 'PHOTO_OBJECT_PERMANENTLY_REMOVED';
    end if;

    update public.review_photo_storage_moderation_jobs
       set status='cancelled',
           updated_at=now()
     where review_photo_id=v_report.review_photo_id
       and action='delete'
       and status in ('queued','failed','processing');

    update public.review_photos
       set moderation_status='visible'
     where id=v_report.review_photo_id;
  end if;

  update public.review_photo_reports
     set status=v_status,
         resolution=v_resolution,
         reviewed_by=v_uid,
         reviewed_at=now(),
         details=case
           when nullif(trim(coalesce(p_notes,'')),'') is null then details
           else concat_ws(E'\n',details,'Owner moderation: '||left(trim(p_notes),1000))
         end,
         updated_at=now()
   where id=p_report_id
  returning * into v_report;

  if v_status='resolved' and v_resolution in ('hide','restore') then
    update public.review_photo_reports
       set status='resolved',
           resolution=v_resolution,
           reviewed_by=v_uid,
           reviewed_at=now(),
           updated_at=now()
     where review_photo_id=v_report.review_photo_id
       and id<>v_report.id
       and status in ('open','reviewing');
  end if;

  if v_status='resolved'
     and v_resolution='hide'
     and v_report.reason in ('privacy','explicit')
     and nullif(v_photo_path,'') is not null then
    insert into public.review_photo_storage_moderation_jobs(
      report_id,review_photo_id,bucket_id,object_path,action,reason,status,requested_by
    )
    values(
      v_report.id,v_report.review_photo_id,'review-photos',v_photo_path,'delete',v_report.reason,'queued',v_uid
    )
    on conflict (review_photo_id,action,object_path) where review_photo_id is not null
    do update set
      report_id=excluded.report_id,
      reason=excluded.reason,
      requested_by=excluded.requested_by,
      status=case
        when public.review_photo_storage_moderation_jobs.status='completed' then 'completed'
        else 'queued'
      end,
      last_error=null,
      updated_at=now()
    returning id,status into v_storage_job_id,v_storage_state;

    if v_storage_state <> 'completed' then
      perform net.http_post(
        url := 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/review-photo-storage-moderation',
        body := jsonb_build_object('source','admin_resolve_review_photo_report'),
        headers := '{"Content-Type":"application/json"}'::jsonb,
        timeout_milliseconds := 5000
      );
    end if;
  end if;

  return jsonb_build_object(
    'report',to_jsonb(v_report),
    'review_photo_id',v_report.review_photo_id,
    'moderation_status',(select moderation_status from public.review_photos where id=v_report.review_photo_id),
    'storage_takedown',jsonb_build_object(
      'required',v_report.reason in ('privacy','explicit') and v_resolution='hide' and v_status='resolved',
      'job_id',v_storage_job_id,
      'status',v_storage_state
    )
  );
end;
$$;

revoke all on function public.admin_resolve_review_photo_report(uuid,text,text,text) from public, anon;
grant execute on function public.admin_resolve_review_photo_report(uuid,text,text,text) to authenticated, service_role;
