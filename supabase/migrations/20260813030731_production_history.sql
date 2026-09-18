create table if not exists public.demo_identity_registry (
 id uuid primary key default gen_random_uuid(),
 demo_key text not null unique,
 display_name text not null,
 username text not null unique,
 subscription_tier text not null check(subscription_tier in ('premium','fleet','enterprise')),
 auth_user_id uuid unique,
 profile_id uuid unique references public.profiles(id) on delete set null,
 status text not null default 'pending' check(status in ('pending','linked','disabled')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.demo_identity_registry enable row level security;
create policy "demo identities visible to authenticated users" on public.demo_identity_registry for select to authenticated using(true);

create or replace function public.demo_register_identity(p_demo_key text,p_display_name text,p_username text,p_subscription_tier text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if p_subscription_tier not in ('premium','fleet','enterprise') then raise exception 'unsupported demo tier'; end if;
 insert into public.demo_identity_registry(demo_key,display_name,username,subscription_tier)
 values(trim(p_demo_key),trim(p_display_name),trim(p_username),p_subscription_tier)
 on conflict(demo_key) do update set display_name=excluded.display_name,username=excluded.username,subscription_tier=excluded.subscription_tier,updated_at=now()
 returning id into v_id;
 return v_id;
end;$$;
grant execute on function public.demo_register_identity(text,text,text,text) to authenticated;

create or replace function public.demo_link_identity(p_demo_key text,p_auth_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_demo public.demo_identity_registry%rowtype; v_profile uuid;
begin
 select * into v_demo from public.demo_identity_registry where demo_key=trim(p_demo_key) for update;
 if v_demo.id is null then raise exception 'demo identity not found'; end if;
 if auth.uid() is distinct from p_auth_user_id then raise exception 'only the authenticated user can link itself'; end if;
 insert into public.profiles(id,display_name,username,subscription_tier,is_demo_test)
 values(p_auth_user_id,v_demo.display_name,v_demo.username,v_demo.subscription_tier,true)
 on conflict(id) do update set display_name=excluded.display_name,username=excluded.username,subscription_tier=excluded.subscription_tier,is_demo_test=true,updated_at=now()
 returning id into v_profile;
 update public.demo_identity_registry set auth_user_id=p_auth_user_id,profile_id=v_profile,status='linked',updated_at=now() where id=v_demo.id;
 return v_profile;
end;$$;
grant execute on function public.demo_link_identity(text,uuid) to authenticated;
