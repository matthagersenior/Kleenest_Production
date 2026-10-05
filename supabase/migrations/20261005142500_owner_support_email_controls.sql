-- Converge in-app support into the first-party Owner Email Center and add core mailbox controls.

alter table public.support_requests
  add column if not exists source_app text not null default 'consumer';

do $$ begin
  alter table public.support_requests
    add constraint support_requests_source_app_check
    check (source_app in ('consumer','business','fleet','owner','web','unknown'));
exception when duplicate_object then null; end $$;

alter table public.owner_email_center_settings
  add column if not exists aliases text[] not null default '{}',
  add column if not exists blocked_senders text[] not null default '{}';

alter table public.owner_email_center_threads
  add column if not exists support_request_id uuid references public.support_requests(id) on delete set null,
  add column if not exists source_app text;

alter table public.owner_email_center_threads
  drop constraint if exists owner_email_center_threads_folder_check;
alter table public.owner_email_center_threads
  add constraint owner_email_center_threads_folder_check
  check (folder in ('inbox','archive','sent','drafts','spam','trash'));

create unique index if not exists owner_email_center_threads_owner_support_request_idx
  on public.owner_email_center_threads(owner_user_id,support_request_id)
  where support_request_id is not null;

drop function if exists public.submit_support_request(text,text,text);
create function public.submit_support_request(
  p_subject text,
  p_message text,
  p_category text default 'general',
  p_source_app text default 'consumer'
)
returns public.support_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_subject text := pg_catalog.btrim(pg_catalog.coalesce(p_subject,''));
  v_message text := pg_catalog.btrim(pg_catalog.coalesce(p_message,''));
  v_category text := pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(p_category,'general')));
  v_source_app text := pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(p_source_app,'consumer')));
  v_request public.support_requests;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if pg_catalog.length(v_subject) < 3 then raise exception 'SUBJECT_TOO_SHORT'; end if;
  if pg_catalog.length(v_subject) > 160 then raise exception 'SUBJECT_TOO_LONG'; end if;
  if pg_catalog.length(v_message) < 10 then raise exception 'MESSAGE_TOO_SHORT'; end if;
  if pg_catalog.length(v_message) > 5000 then raise exception 'MESSAGE_TOO_LONG'; end if;
  if v_category not in ('general','account','billing','technical','safety','feedback') then raise exception 'INVALID_SUPPORT_CATEGORY'; end if;
  if v_source_app not in ('consumer','business','fleet','owner','web','unknown') then raise exception 'INVALID_SUPPORT_SOURCE'; end if;

  insert into public.support_requests(user_id,subject,message,category,status,priority,admin_notes,source_app)
  values(v_uid,v_subject,v_message,v_category,'open','normal',null,v_source_app)
  returning * into v_request;
  return v_request;
end;
$$;

revoke all on function public.submit_support_request(text,text,text,text) from public, anon;
grant execute on function public.submit_support_request(text,text,text,text) to authenticated;

create or replace function internal.route_support_request_to_owner_email_center()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner record;
  v_thread_id uuid;
  v_sender text;
  v_now timestamptz := pg_catalog.coalesce(new.created_at, pg_catalog.now());
begin
  select pg_catalog.lower(u.email) into v_sender
  from auth.users u
  where u.id = new.user_id;

  if v_sender is null or v_sender = '' then
    v_sender := 'app-user+' || pg_catalog.replace(new.user_id::text,'-','') || '@kleenest.local';
  end if;

  for v_owner in
    select owner_user_id,inbox_address
    from public.owner_email_center_settings
  loop
    insert into public.owner_email_center_threads(
      owner_user_id,subject,normalized_subject,folder,unread,priority,labels,participants,
      snippet,latest_direction,message_count,last_message_at,support_request_id,source_app
    )
    values(
      v_owner.owner_user_id,new.subject,pg_catalog.lower(pg_catalog.btrim(new.subject)),'inbox',true,new.priority,
      array['support',new.source_app,new.category]::text[],
      array[v_sender,v_owner.inbox_address]::text[],
      pg_catalog.left(new.message,240),'inbound',1,v_now,new.id,new.source_app
    )
    on conflict (owner_user_id,support_request_id) where support_request_id is not null
    do update set
      subject=excluded.subject,
      snippet=excluded.snippet,
      unread=true,
      folder='inbox',
      labels=excluded.labels,
      source_app=excluded.source_app,
      updated_at=pg_catalog.now()
    returning id into v_thread_id;

    if not exists (
      select 1 from public.owner_email_center_messages
      where thread_id=v_thread_id and headers->>'support_request_id'=new.id::text
    ) then
      insert into public.owner_email_center_messages(
        thread_id,owner_user_id,direction,from_address,from_name,to_addresses,subject,text_body,
        headers,attachments,delivery_status,received_at
      )
      values(
        v_thread_id,v_owner.owner_user_id,'inbound',v_sender,
        pg_catalog.initcap(new.source_app) || ' app support',
        array[v_owner.inbox_address]::text[],new.subject,new.message,
        jsonb_build_object(
          'channel','app_support',
          'support_request_id',new.id,
          'source_app',new.source_app,
          'category',new.category,
          'user_id',new.user_id
        ),
        '[]'::jsonb,'received',v_now
      );
    end if;

    insert into public.owner_email_center_audit(owner_user_id,thread_id,action,detail)
    values(v_owner.owner_user_id,v_thread_id,'support_receive',
      jsonb_build_object('support_request_id',new.id,'source_app',new.source_app,'category',new.category));
  end loop;

  return new;
end;
$$;

revoke all on function internal.route_support_request_to_owner_email_center() from public, anon, authenticated;

drop trigger if exists support_requests_owner_email_center on public.support_requests;
create trigger support_requests_owner_email_center
after insert on public.support_requests
for each row
execute function internal.route_support_request_to_owner_email_center();


-- Notify users once for every Owner reply, including later replies after the request is already in progress.
create or replace function internal.notify_support_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reply_changed boolean := new.admin_notes is distinct from old.admin_notes and pg_catalog.coalesce(new.admin_notes,'') <> '';
  v_status_changed boolean := new.status is distinct from old.status;
begin
  if v_reply_changed or v_status_changed then
    insert into public.notifications(user_id,type,title,body,data)
    values(
      new.user_id,
      'support_status',
      case when v_reply_changed then 'Kleenest Support replied' else 'Support request updated' end,
      case
        when v_reply_changed then pg_catalog.left(new.admin_notes,240)
        else pg_catalog.format(
          'Your support request "%s" is now %s.',
          pg_catalog.left(new.subject,80),
          pg_catalog.replace(pg_catalog.coalesce(new.status,'updated'),'_',' ')
        )
      end,
      jsonb_build_object(
        'support_request_id',new.id,
        'support_status',new.status,
        'source_app',new.source_app,
        'has_reply',v_reply_changed
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function internal.notify_support_request_status_change() from public, anon, authenticated;

drop trigger if exists support_requests_notify_status_change on public.support_requests;
create trigger support_requests_notify_status_change
after update of status, admin_notes on public.support_requests
for each row
when (
  old.status is distinct from new.status
  or old.admin_notes is distinct from new.admin_notes
)
execute function internal.notify_support_request_status_change();
