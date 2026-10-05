-- First-party Kleenest mail directory: named/shared mailboxes, aliases, access metadata and forwarding.
create table if not exists public.owner_email_mailboxes (
  id uuid primary key default gen_random_uuid(),
  address text not null unique,
  display_name text not null,
  mailbox_type text not null default 'shared'
    check (mailbox_type in ('personal','shared','system')),
  owner_user_id uuid null,
  send_enabled boolean not null default true,
  forwarding_enabled boolean not null default false,
  forwarding_targets text[] not null default '{}',
  keep_copy boolean not null default true,
  signature_text text not null default '',
  auto_reply_enabled boolean not null default false,
  auto_reply_subject text not null default '',
  auto_reply_body text not null default '',
  active boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_email_mailboxes_address_check
    check (address = lower(address) and address ~ '^[a-z0-9.!#$%&''*+/=?^_{}|~-]+@kleenest[.]us$')
);

create table if not exists public.owner_email_mailbox_members (
  mailbox_id uuid not null references public.owner_email_mailboxes(id) on delete cascade,
  user_id uuid not null,
  access_role text not null default 'viewer'
    check (access_role in ('owner','manager','responder','viewer')),
  can_send boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (mailbox_id,user_id)
);

create table if not exists public.owner_email_mailbox_aliases (
  alias_address text primary key,
  mailbox_id uuid not null references public.owner_email_mailboxes(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint owner_email_mailbox_aliases_address_check
    check (alias_address = lower(alias_address) and alias_address ~ '^[a-z0-9.!#$%&''*+/=?^_{}|~-]+@kleenest[.]us$')
);

alter table public.owner_email_center_threads
  add column if not exists mailbox_id uuid references public.owner_email_mailboxes(id) on delete set null,
  add column if not exists recipient_address text;

alter table public.owner_email_center_messages
  add column if not exists mailbox_id uuid references public.owner_email_mailboxes(id) on delete set null;

create index if not exists owner_email_center_threads_mailbox_idx
  on public.owner_email_center_threads(mailbox_id,last_message_at desc);
create index if not exists owner_email_center_messages_mailbox_idx
  on public.owner_email_center_messages(mailbox_id,created_at desc);
create index if not exists owner_email_mailbox_members_user_idx
  on public.owner_email_mailbox_members(user_id,mailbox_id);

alter table public.owner_email_mailboxes enable row level security;
alter table public.owner_email_mailbox_members enable row level security;
alter table public.owner_email_mailbox_aliases enable row level security;
revoke all on table public.owner_email_mailboxes from anon, authenticated;
revoke all on table public.owner_email_mailbox_members from anon, authenticated;
revoke all on table public.owner_email_mailbox_aliases from anon, authenticated;

-- Seed the core addresses against the current platform owner.
with primary_owner as (
  select owner_user_id
  from public.owner_email_center_settings
  order by created_at asc
  limit 1
), seed(address,display_name,mailbox_type,send_enabled) as (
  values
    ('support@kleenest.us','Kleenest Support','shared',true),
    ('matt@kleenest.us','Matt','personal',true),
    ('admin@kleenest.us','Kleenest Admin','shared',true),
    ('hello@kleenest.us','Kleenest','shared',true),
    ('business@kleenest.us','Kleenest Business','shared',true),
    ('fleet@kleenest.us','Kleenest Fleet','shared',true),
    ('privacy@kleenest.us','Kleenest Privacy','shared',true),
    ('partnerships@kleenest.us','Kleenest Partnerships','shared',true),
    ('noreply@kleenest.us','Kleenest','system',true)
)
insert into public.owner_email_mailboxes(address,display_name,mailbox_type,owner_user_id,send_enabled,created_by)
select seed.address,seed.display_name,seed.mailbox_type,
  case when seed.mailbox_type='personal' then p.owner_user_id else null end,
  seed.send_enabled,p.owner_user_id
from seed cross join primary_owner p
on conflict(address) do update set
  display_name=excluded.display_name,
  mailbox_type=excluded.mailbox_type,
  owner_user_id=coalesce(public.owner_email_mailboxes.owner_user_id,excluded.owner_user_id),
  send_enabled=excluded.send_enabled,
  updated_at=now();

insert into public.owner_email_mailbox_members(mailbox_id,user_id,access_role,can_send)
select m.id,s.owner_user_id,'owner',true
from public.owner_email_mailboxes m
cross join (
  select owner_user_id from public.owner_email_center_settings order by created_at asc limit 1
) s
where m.address like '%@kleenest.us'
on conflict(mailbox_id,user_id) do update set
  access_role='owner',can_send=true,updated_at=now();

insert into public.owner_email_mailbox_aliases(alias_address,mailbox_id)
select v.alias_address,m.id
from (values
  ('help@kleenest.us','support@kleenest.us'),
  ('contact@kleenest.us','hello@kleenest.us'),
  ('partners@kleenest.us','partnerships@kleenest.us')
) v(alias_address,target_address)
join public.owner_email_mailboxes m on m.address=v.target_address
on conflict(alias_address) do update set mailbox_id=excluded.mailbox_id,active=true;

-- Existing mail belongs to the support mailbox until a more specific recipient is known.
update public.owner_email_center_threads t
set mailbox_id=m.id,
    recipient_address=coalesce(t.recipient_address,m.address)
from public.owner_email_mailboxes m
where t.mailbox_id is null and m.address='support@kleenest.us';

update public.owner_email_center_messages msg
set mailbox_id=t.mailbox_id
from public.owner_email_center_threads t
where msg.thread_id=t.id and msg.mailbox_id is null;

-- Keep in-app support tied to the Support mailbox.
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
  v_mailbox_id uuid;
  v_now timestamptz := pg_catalog.coalesce(new.created_at, pg_catalog.now());
begin
  select id into v_mailbox_id
  from public.owner_email_mailboxes
  where address='support@kleenest.us' and active=true
  limit 1;

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
      snippet,latest_direction,message_count,last_message_at,support_request_id,source_app,
      mailbox_id,recipient_address
    )
    values(
      v_owner.owner_user_id,new.subject,pg_catalog.lower(pg_catalog.btrim(new.subject)),'inbox',true,new.priority,
      array['support',new.source_app,new.category]::text[],
      array[v_sender,'support@kleenest.us']::text[],
      pg_catalog.left(new.message,240),'inbound',1,v_now,new.id,new.source_app,
      v_mailbox_id,'support@kleenest.us'
    )
    on conflict (owner_user_id,support_request_id) where support_request_id is not null
    do update set
      subject=excluded.subject,
      snippet=excluded.snippet,
      unread=true,
      folder='inbox',
      labels=excluded.labels,
      source_app=excluded.source_app,
      mailbox_id=excluded.mailbox_id,
      recipient_address=excluded.recipient_address,
      updated_at=pg_catalog.now()
    returning id into v_thread_id;

    if not exists (
      select 1 from public.owner_email_center_messages
      where thread_id=v_thread_id and headers->>'support_request_id'=new.id::text
    ) then
      insert into public.owner_email_center_messages(
        thread_id,owner_user_id,direction,from_address,from_name,to_addresses,subject,text_body,
        headers,attachments,delivery_status,received_at,mailbox_id
      )
      values(
        v_thread_id,v_owner.owner_user_id,'inbound',v_sender,
        pg_catalog.initcap(new.source_app) || ' app support',
        array['support@kleenest.us']::text[],new.subject,new.message,
        jsonb_build_object(
          'channel','app_support',
          'support_request_id',new.id,
          'source_app',new.source_app,
          'category',new.category,
          'user_id',new.user_id
        ),
        '[]'::jsonb,'received',v_now,v_mailbox_id
      );
    end if;

    insert into public.owner_email_center_audit(owner_user_id,thread_id,action,detail)
    values(v_owner.owner_user_id,v_thread_id,'support_receive',
      jsonb_build_object('support_request_id',new.id,'source_app',new.source_app,'category',new.category,'mailbox','support@kleenest.us'));
  end loop;

  return new;
end;
$$;

revoke all on function internal.route_support_request_to_owner_email_center() from public, anon, authenticated;
