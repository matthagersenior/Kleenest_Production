create table if not exists public.policy_acceptances (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  terms_version text not null,
  community_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now()
);

alter table public.policy_acceptances enable row level security;
drop policy if exists "Users can view their policy acceptance" on public.policy_acceptances;
create policy "Users can view their policy acceptance" on public.policy_acceptances for select to authenticated using (user_id = auth.uid());

create or replace function public.has_current_policy_acceptance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.policy_acceptances p
    where p.user_id = auth.uid()
      and p.terms_version = '2026-09-01'
      and p.community_version = '2026-09-01'
      and p.privacy_version = '2026-09-01'
  );
$$;

create or replace function public.accept_current_policies()
returns public.policy_acceptances
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.policy_acceptances;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.policy_acceptances(user_id,terms_version,community_version,privacy_version,accepted_at)
  values(auth.uid(),'2026-09-01','2026-09-01','2026-09-01',now())
  on conflict(user_id) do update set terms_version=excluded.terms_version,community_version=excluded.community_version,privacy_version=excluded.privacy_version,accepted_at=excluded.accepted_at
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.has_current_policy_acceptance() from public, anon;
revoke all on function public.accept_current_policies() from public, anon;
grant execute on function public.has_current_policy_acceptance() to authenticated;
grant execute on function public.accept_current_policies() to authenticated;
