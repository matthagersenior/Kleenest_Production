create extension if not exists pg_net with schema extensions;
create schema if not exists archive;

create table if not exists archive.object_manifests (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  object_path text not null unique,
  content_sha256 text not null,
  byte_count bigint not null check (byte_count >= 0),
  row_count integer not null check (row_count >= 0),
  first_row_id uuid,
  last_row_id uuid,
  codec text not null default 'gzip-jsonl-v1',
  source_project text not null default 'kleenest-production',
  verified_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists object_manifests_kind_created_idx on archive.object_manifests(kind,created_at desc);
alter table archive.object_manifests enable row level security;
revoke all on archive.object_manifests from public,anon,authenticated;
grant select,insert,update,delete on archive.object_manifests to service_role;

create or replace function public.register_archive_object_manifest(
 p_kind text,p_object_path text,p_content_sha256 text,p_byte_count bigint,p_row_count integer,
 p_first_row_id uuid,p_last_row_id uuid,p_verified_at timestamptz,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' and current_user <> 'service_role' then raise exception 'service_role required'; end if;
 insert into archive.object_manifests(kind,object_path,content_sha256,byte_count,row_count,first_row_id,last_row_id,verified_at,metadata)
 values(p_kind,p_object_path,p_content_sha256,p_byte_count,p_row_count,p_first_row_id,p_last_row_id,coalesce(p_verified_at,now()),coalesce(p_metadata,'{}'::jsonb))
 on conflict(object_path) do update set content_sha256=excluded.content_sha256,byte_count=excluded.byte_count,row_count=excluded.row_count,
 first_row_id=excluded.first_row_id,last_row_id=excluded.last_row_id,verified_at=excluded.verified_at,metadata=excluded.metadata
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.register_archive_object_manifest(text,text,text,bigint,integer,uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.register_archive_object_manifest(text,text,text,bigint,integer,uuid,uuid,timestamptz,jsonb) to service_role;

create or replace function public.archive_object_backfill_batch(p_kind text,p_after_id uuid default null,p_limit integer default 1000)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb:='[]'::jsonb; v_last uuid; v_limit integer:=greatest(1,least(coalesce(p_limit,1000),2000));
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' and current_user <> 'service_role' then raise exception 'service_role required'; end if;
 if p_kind='geo_locations' then
  with q as materialized(select * from public.geo_locations where p_after_id is null or id>p_after_id order by id limit v_limit)
  select coalesce((select jsonb_agg(to_jsonb(q) order by id) from q),'[]'::jsonb),(select id from q order by id desc limit 1) into v_rows,v_last;
 elsif p_kind='external_location_records' then
  with q as materialized(select * from archive.external_location_records where p_after_id is null or id>p_after_id order by id limit v_limit)
  select coalesce((select jsonb_agg(to_jsonb(q) order by id) from q),'[]'::jsonb),(select id from q order by id desc limit 1) into v_rows,v_last;
 elsif p_kind='external_observations' then
  with q as materialized(select * from archive.external_observations where p_after_id is null or id>p_after_id order by id limit v_limit)
  select coalesce((select jsonb_agg(to_jsonb(q) order by id) from q),'[]'::jsonb),(select id from q order by id desc limit 1) into v_rows,v_last;
 elsif p_kind='national_ingestion_runs' then
  with q as materialized(select * from archive.national_ingestion_runs where p_after_id is null or id>p_after_id order by id limit v_limit)
  select coalesce((select jsonb_agg(to_jsonb(q) order by id) from q),'[]'::jsonb),(select id from q order by id desc limit 1) into v_rows,v_last;
 else raise exception 'unsupported archive kind: %',p_kind;
 end if;
 return jsonb_build_object('kind',p_kind,'rows',v_rows,'row_count',jsonb_array_length(v_rows),'next_id',v_last,'done',jsonb_array_length(v_rows)=0);
end $$;
revoke all on function public.archive_object_backfill_batch(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.archive_object_backfill_batch(text,uuid,integer) to service_role;
