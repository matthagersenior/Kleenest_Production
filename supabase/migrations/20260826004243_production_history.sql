do $$ begin
  if to_regclass('public.location_bathroom_intelligence') is null then
    create table public.location_bathroom_intelligence (
      location_id uuid primary key references public.locations(id) on delete cascade,
      status text not null default 'unknown' check (status in ('confirmed','likely','uncertain','no_bathroom','unknown')),
      access text not null default 'unknown' check (access in ('public','customers','permissive','unknown','none')),
      confidence numeric(5,2) not null default 0 check (confidence between 0 and 100),
      evidence_count integer not null default 0,
      explicit_positive boolean not null default false,
      explicit_negative boolean not null default false,
      category_prior numeric(5,2) not null default 0,
      source_score numeric(5,2) not null default 0,
      freshness_score numeric(5,2) not null default 0,
      computed_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;
end $$;

create index if not exists idx_location_bathroom_intelligence_status on public.location_bathroom_intelligence(status);
create index if not exists idx_location_bathroom_intelligence_access on public.location_bathroom_intelligence(access);
create index if not exists idx_location_bathroom_intelligence_confidence on public.location_bathroom_intelligence(confidence desc);

create or replace function public.compute_bathroom_intelligence(p_location_id uuid)
returns public.location_bathroom_intelligence
language plpgsql security definer set search_path=public,extensions as $$
declare
 v_category text; v_positive int:=0; v_negative int:=0; v_customers int:=0; v_permissive int:=0; v_public int:=0; v_evidence int:=0;
 v_pos boolean:=false; v_neg boolean:=false; v_access text:='unknown'; v_status text:='unknown'; v_prior numeric:=0; v_source numeric:=0; v_conf numeric:=0; v_row public.location_bathroom_intelligence;
begin
 select lower(coalesce(place_type,'')) into v_category from public.locations where id=p_location_id;
 select count(*) filter(where lower(coalesce(value_text,'')) in('yes','true','1','vault')),
        count(*) filter(where lower(coalesce(value_text,'')) in('no','false','0')),
        count(*) filter(where lower(coalesce(attribute_key,'')) like '%toilets:access%' and lower(coalesce(value_text,''))='customers'),
        count(*) filter(where lower(coalesce(attribute_key,'')) like '%toilets:access%' and lower(coalesce(value_text,''))='permissive'),
        count(*) filter(where lower(coalesce(attribute_key,'')) like '%toilets:access%' and lower(coalesce(value_text,''))='yes')
 into v_positive,v_negative,v_customers,v_permissive,v_public
 from public.external_observations eo
 where eo.location_id=p_location_id and lower(coalesce(eo.attribute_key,'')) like '%toilets%';
 v_evidence:=v_positive+v_negative+v_customers+v_permissive+v_public; v_pos:=v_evidence>0 and v_positive+v_customers+v_permissive+v_public>0; v_neg:=v_negative>0;
 v_prior:=case when v_category in('restaurant','gas_station','cafe','shopping','service','health','library','restroom','hotel','bar','fast_food') then 75 when v_category in('park','dog_park','public_safety','transit','travel') then 50 else 25 end;
 v_source:=least(100,v_evidence*25);
 if v_pos and v_neg then v_status:='uncertain'; elsif v_pos then v_status:='confirmed'; elsif v_neg then v_status:='no_bathroom'; elsif v_prior>=75 then v_status:='likely'; elsif v_prior>=50 then v_status:='uncertain'; end if;
 if v_customers>0 then v_access:='customers'; elsif v_public>0 then v_access:='public'; elsif v_permissive>0 then v_access:='permissive'; elsif v_neg then v_access:='none'; end if;
 v_conf:=case when v_pos and v_neg then 60 when v_pos then least(99,80+v_source*.19) when v_neg then 95 when v_prior>=75 then v_prior when v_prior>=50 then 55 else 20 end;
 insert into public.location_bathroom_intelligence as bi(location_id,status,access,confidence,evidence_count,explicit_positive,explicit_negative,category_prior,source_score,freshness_score,computed_at,updated_at)
 values(p_location_id,v_status,v_access,v_conf,v_evidence,v_pos,v_neg,v_prior,v_source,100,now(),now())
 on conflict(location_id) do update set status=excluded.status,access=excluded.access,confidence=excluded.confidence,evidence_count=excluded.evidence_count,explicit_positive=excluded.explicit_positive,explicit_negative=excluded.explicit_negative,category_prior=excluded.category_prior,source_score=excluded.source_score,freshness_score=excluded.freshness_score,computed_at=excluded.computed_at,updated_at=now()
 returning * into v_row;
 return v_row;
end $$;

create or replace function public.refresh_bathroom_intelligence(p_limit integer default 1000) returns integer language plpgsql security definer set search_path=public,extensions as $$
declare v_id uuid; v_count integer:=0; begin for v_id in select id from public.locations order by updated_at desc nulls last limit greatest(1,least(p_limit,10000)) loop perform public.compute_bathroom_intelligence(v_id); v_count:=v_count+1; end loop; return v_count; end $$;

create or replace view public.location_bathroom_signals as select l.id location_id,l.name,l.place_type,coalesce(bi.status,'unknown') bathroom_status,coalesce(bi.access,'unknown') bathroom_access,coalesce(bi.confidence,0) bathroom_confidence,coalesce(bi.evidence_count,0) bathroom_evidence_count,bi.computed_at from public.locations l left join public.location_bathroom_intelligence bi on bi.location_id=l.id;

select public.refresh_bathroom_intelligence(10000);
