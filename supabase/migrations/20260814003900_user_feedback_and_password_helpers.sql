begin;

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('bug','feature','general')),
  title text not null check (length(trim(title)) between 3 and 200),
  description text not null check (length(trim(description)) between 5 and 5000),
  page text,
  app_version text,
  browser text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','triaged','in_progress','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_feedback_status_idx on public.user_feedback(status,created_at desc);
create index if not exists user_feedback_user_idx on public.user_feedback(user_id,created_at desc);

alter table public.user_feedback enable row level security;
drop policy if exists feedback_insert on public.user_feedback;
drop policy if exists feedback_select_own on public.user_feedback;
drop policy if exists feedback_admin_select on public.user_feedback;
drop policy if exists feedback_admin_update on public.user_feedback;
create policy feedback_insert on public.user_feedback for insert to anon,authenticated with check (user_id is null or user_id=(select auth.uid()));
create policy feedback_select_own on public.user_feedback for select to authenticated using (user_id=(select auth.uid()));
create policy feedback_admin_select on public.user_feedback for select to authenticated using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
create policy feedback_admin_update on public.user_feedback for update to authenticated using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')) with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));

create or replace function public.submit_feedback(p_type text,p_title text,p_description text,p_page text default null,p_metadata jsonb default '{}'::jsonb)
returns public.user_feedback
language plpgsql security invoker set search_path=public as $$
declare result public.user_feedback;
begin
 if p_type not in ('bug','feature','general') then raise exception 'Invalid feedback type'; end if;
 if length(trim(coalesce(p_title,''))) < 3 then raise exception 'Title is required'; end if;
 if length(trim(coalesce(p_description,''))) < 5 then raise exception 'Description is required'; end if;
 insert into public.user_feedback(user_id,type,title,description,page,app_version,browser,metadata)
 values(auth.uid(),p_type,trim(p_title),trim(p_description),nullif(trim(p_page),''),nullif(current_setting('request.headers',true),'')::jsonb->>'x-kleenest-version',nullif(current_setting('request.headers',true),'')::jsonb->>'user-agent',coalesce(p_metadata,'{}'::jsonb)) returning * into result;
 return result;
end; $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists user_feedback_touch on public.user_feedback;
create trigger user_feedback_touch before update on public.user_feedback for each row execute function public.touch_updated_at();

commit;
