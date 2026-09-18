create table if not exists public.preferred_usage_events (
 id uuid primary key default gen_random_uuid(),
 activation_id uuid not null,
 user_id uuid not null references public.profiles(id) on delete cascade,
 location_id uuid not null,
 business_id uuid,
 program_id uuid,
 event_type text not null check(event_type in ('activated','visited','benefit_redeemed')),
 occurred_at timestamptz not null default now(),
 metadata jsonb not null default '{}'::jsonb
);
create index if not exists preferred_usage_events_business_idx on public.preferred_usage_events(business_id,occurred_at desc);
create index if not exists preferred_usage_events_user_idx on public.preferred_usage_events(user_id,occurred_at desc);
create index if not exists preferred_usage_events_location_idx on public.preferred_usage_events(location_id,occurred_at desc);
alter table public.preferred_usage_events enable row level security;

create or replace function public.record_preferred_usage(p_activation_id uuid,p_event_type text,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_user uuid; v_location uuid; v_business uuid; v_program uuid;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select user_id,location_id,program_id into v_user,v_location,v_program from public.preferred_location_activations where id=p_activation_id and user_id=auth.uid() and status='active';
 if v_user is null then raise exception 'activation_not_found_or_inactive'; end if;
 select business_id into v_business from public.locations where id=v_location;
 insert into public.preferred_usage_events(activation_id,user_id,location_id,business_id,program_id,event_type,metadata)
 values(p_activation_id,v_user,v_location,v_business,v_program,p_event_type,coalesce(p_metadata,'{}'::jsonb)) returning id into v_id;
 return v_id;
end;$$;
grant execute on function public.record_preferred_usage(uuid,text,jsonb) to authenticated;

create or replace view public.preferred_business_analytics as
select business_id,program_id,location_id,event_type,date_trunc('day',occurred_at) as day,count(*) as event_count,count(distinct user_id) as unique_users
from public.preferred_usage_events group by business_id,program_id,location_id,event_type,date_trunc('day',occurred_at);
