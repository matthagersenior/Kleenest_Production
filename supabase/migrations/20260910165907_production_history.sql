-- Preserve broad metro markets and add explicit connector coverage between them.
update public.national_ingestion_markets set priority=-15000, updated_at=now() where market_key='focus_corridor_kansas_city';
update public.national_ingestion_markets set priority=-14990, updated_at=now() where market_key='focus_corridor_columbia_mo';
update public.national_ingestion_markets set priority=-14980, name='KC→Chicago Frontier — Springfield MO', updated_at=now() where market_key='focus_corridor_springfield_mo_branch';
update public.national_ingestion_markets set priority=-14970, updated_at=now() where market_key='focus_corridor_st_louis_mo';
update public.national_ingestion_markets set priority=-14960, updated_at=now() where market_key='focus_corridor_springfield_il';
update public.national_ingestion_markets set priority=-14950, updated_at=now() where market_key='focus_corridor_bloomington_il';
update public.national_ingestion_markets set priority=-14940, updated_at=now() where market_key='focus_corridor_chicago';

insert into public.national_ingestion_markets (market_key,name,state_code,market_kind,priority,bbox,status,source_progress,updated_at)
values
('focus_corridor_kc_columbia_i70','KC→Chicago Connector — Kansas City ↔ Columbia (I-70)','MO','state_fill',-14995,'[38.70,-94.15,39.25,-92.75]'::jsonb,'pending','{}'::jsonb,now()),
('focus_corridor_columbia_stl_i70','KC→Chicago Connector — Columbia ↔ St. Louis (I-70)','MO','state_fill',-14985,'[38.55,-92.10,39.25,-90.55]'::jsonb,'pending','{}'::jsonb,now()),
('focus_corridor_kc_springfield_mo','KC→Chicago Connector — Kansas City ↔ Springfield MO','MO','state_fill',-14979,'[37.10,-94.85,38.75,-93.05]'::jsonb,'pending','{}'::jsonb,now()),
('focus_corridor_springfield_mo_rolla_i44','KC→Chicago Connector — Springfield MO ↔ Rolla (I-44)','MO','state_fill',-14977,'[37.05,-93.20,38.00,-91.55]'::jsonb,'pending','{}'::jsonb,now()),
('focus_corridor_rolla_stl_i44','KC→Chicago Connector — Rolla ↔ St. Louis (I-44)','MO','state_fill',-14975,'[37.45,-91.85,38.80,-90.20]'::jsonb,'pending','{}'::jsonb,now()),
('focus_corridor_stl_springfield_il_i55','KC→Chicago Connector — St. Louis ↔ Springfield IL (I-55)','IL','state_fill',-14965,'[38.55,-90.75,39.90,-89.15]'::jsonb,'pending','{}'::jsonb,now()),
('focus_corridor_springfield_bloomington_i55','KC→Chicago Connector — Springfield IL ↔ Bloomington-Normal (I-55)','IL','state_fill',-14955,'[39.60,-89.85,40.75,-88.65]'::jsonb,'pending','{}'::jsonb,now()),
('focus_corridor_bloomington_chicago_i55','KC→Chicago Connector — Bloomington-Normal ↔ Chicago (I-55)','IL','state_fill',-14945,'[40.50,-89.10,42.10,-87.45]'::jsonb,'pending','{}'::jsonb,now())
on conflict (market_key) do update set
  name=excluded.name,
  state_code=excluded.state_code,
  market_kind=excluded.market_kind,
  priority=excluded.priority,
  bbox=excluded.bbox,
  status=case when public.national_ingestion_markets.status='completed' then public.national_ingestion_markets.status else 'pending' end,
  updated_at=now();
