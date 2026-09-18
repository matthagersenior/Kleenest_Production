create table if not exists public.intelligence_action_links (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  surface text not null check (surface in ('business','fleet','consumer')),
  signal_type text not null,
  action_type text not null,
  status text not null default 'suggested' check (status in ('suggested','accepted','dismissed','completed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists intelligence_action_links_location_idx on public.intelligence_action_links(location_id,created_at desc);
create index if not exists intelligence_action_links_business_idx on public.intelligence_action_links(business_id,created_at desc);
alter table public.intelligence_action_links enable row level security;
create policy "business members can read intelligence actions" on public.intelligence_action_links for select using (business_id is null or exists(select 1 from public.business_members bm where bm.business_id=intelligence_action_links.business_id and bm.user_id=auth.uid()));
create policy "business members can update intelligence actions" on public.intelligence_action_links for update using (business_id is null or exists(select 1 from public.business_members bm where bm.business_id=intelligence_action_links.business_id and bm.user_id=auth.uid()));
create or replace function public.create_intelligence_action_link(p_location_id uuid,p_business_id uuid,p_surface text,p_signal_type text,p_action_type text,p_metadata jsonb default '{}'::jsonb)
returns public.intelligence_action_links language plpgsql security invoker set search_path=public as $$
declare v_row public.intelligence_action_links;
begin
 if p_business_id is not null and not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid()) then raise exception 'Not authorized'; end if;
 insert into public.intelligence_action_links(location_id,business_id,surface,signal_type,action_type,metadata) values(p_location_id,p_business_id,p_surface,p_signal_type,p_action_type,coalesce(p_metadata,'{}'::jsonb)) returning * into v_row;
 return v_row;
end; $$;
