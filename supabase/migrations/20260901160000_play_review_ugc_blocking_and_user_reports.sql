create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;

drop policy if exists "Users can view their blocks" on public.user_blocks;
create policy "Users can view their blocks" on public.user_blocks for select to authenticated using (blocker_id = auth.uid());
drop policy if exists "Users can create their blocks" on public.user_blocks;
create policy "Users can create their blocks" on public.user_blocks for insert to authenticated with check (blocker_id = auth.uid() and blocked_id <> auth.uid());
drop policy if exists "Users can remove their blocks" on public.user_blocks;
create policy "Users can remove their blocks" on public.user_blocks for delete to authenticated using (blocker_id = auth.uid());

create table if not exists public.user_safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text,
  context text not null default 'profile',
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint user_safety_reports_not_self check (reporter_id <> reported_user_id),
  constraint user_safety_reports_reason_length check (char_length(reason) between 2 and 80),
  constraint user_safety_reports_details_length check (details is null or char_length(details) <= 2000)
);

create index if not exists user_safety_reports_status_created_idx on public.user_safety_reports(status, created_at desc);
create index if not exists user_safety_reports_reported_user_idx on public.user_safety_reports(reported_user_id, created_at desc);
alter table public.user_safety_reports enable row level security;

drop policy if exists "Users can view reports they submitted" on public.user_safety_reports;
create policy "Users can view reports they submitted" on public.user_safety_reports for select to authenticated using (reporter_id = auth.uid());
drop policy if exists "Users can submit safety reports" on public.user_safety_reports;
create policy "Users can submit safety reports" on public.user_safety_reports for insert to authenticated with check (reporter_id = auth.uid() and reported_user_id <> auth.uid());

create or replace function public.block_user(p_user_id uuid)
returns public.user_blocks
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.user_blocks;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_user_id is null or p_user_id = auth.uid() then raise exception 'Choose another user'; end if;
  insert into public.user_blocks(blocker_id, blocked_id) values (auth.uid(), p_user_id)
  on conflict (blocker_id, blocked_id) do update set created_at = public.user_blocks.created_at
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.unblock_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_user_id;
  return found;
end;
$$;

create or replace function public.report_user(p_user_id uuid, p_reason text, p_details text default null, p_context text default 'profile')
returns public.user_safety_reports
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.user_safety_reports;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_user_id is null or p_user_id = auth.uid() then raise exception 'Choose another user'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 2 then raise exception 'Choose a report reason'; end if;
  insert into public.user_safety_reports(reporter_id, reported_user_id, reason, details, context)
  values (auth.uid(), p_user_id, left(trim(p_reason),80), nullif(left(trim(coalesce(p_details,'')),2000),''), left(trim(coalesce(p_context,'profile')),80))
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.enforce_direct_message_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = new.from_id and b.blocked_id = new.to_id)
       or (b.blocker_id = new.to_id and b.blocked_id = new.from_id)
  ) then
    raise exception 'Messaging is unavailable between these accounts';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_enforce_user_blocks on public.messages;
create trigger messages_enforce_user_blocks before insert or update of from_id,to_id on public.messages for each row execute function public.enforce_direct_message_block();

grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.report_user(uuid,text,text,text) to authenticated;
