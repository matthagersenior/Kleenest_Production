create table if not exists public.review_moderation_actions (id uuid primary key default gen_random_uuid(),review_id uuid not null references public.reviews(id) on delete cascade,actor_user_id uuid not null references public.profiles(id),previous_status public.review_status not null,new_status public.review_status not null,reason text not null,created_at timestamptz not null default now());
create index if not exists review_moderation_actions_review_created_idx on public.review_moderation_actions(review_id,created_at desc);
create index if not exists review_moderation_actions_actor_created_idx on public.review_moderation_actions(actor_user_id,created_at desc);

create or replace function public.moderate_review(p_review_id uuid,p_new_status public.review_status,p_reason text) returns public.reviews language plpgsql security definer set search_path='public','auth','extensions','pg_temp' as $function$ declare v_review public.reviews%rowtype; v_uid uuid:=auth.uid(); v_reason text:=nullif(trim(p_reason),''); begin if v_uid is null then raise exception 'AUTH_REQUIRED'; end if; if v_reason is null then raise exception 'MODERATION_REASON_REQUIRED'; end if; if p_new_status not in ('hidden','published') then raise exception 'INVALID_MODERATION_STATUS'; end if; select * into v_review from public.reviews where id=p_review_id for update; if not found then raise exception 'REVIEW_NOT_FOUND'; end if; if not exists(select 1 from public.profiles where id=v_uid and is_admin=true) then raise exception 'ADMIN_REQUIRED'; end if; if v_review.status=p_new_status then return v_review; end if; insert into public.review_moderation_actions(review_id,actor_user_id,previous_status,new_status,reason) values(p_review_id,v_uid,v_review.status,p_new_status,v_reason); update public.reviews set status=p_new_status,updated_at=now() where id=p_review_id returning * into v_review; return v_review; end; $function$;
comment on function public.moderate_review(uuid,public.review_status,text) is 'Admin-only authoritative review moderation transition with immutable moderation provenance. Published/hidden changes are recorded before the state update.';

revoke update(status) on public.reviews from authenticated;
revoke update(status) on public.reviews from anon;
revoke insert,update,delete on public.review_moderation_actions from authenticated;
revoke insert,update,delete on public.review_moderation_actions from anon;

alter table public.review_moderation_actions enable row level security;
drop policy if exists review_moderation_actions_admin_select on public.review_moderation_actions;
create policy review_moderation_actions_admin_select on public.review_moderation_actions for select to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
