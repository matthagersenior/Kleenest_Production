with seed(creator_name,creator_handle,creator_slug,mission_code,tracking_slug) as (
  values
  ('Alexis Zotos','@alexiszotos','alexis-zotos','creator-alexis-family-outing','alexis-family-outing'),
  ('Steph Hampton','@explorestlparks','steph-hampton','creator-steph-park-scout','steph-park-scout'),
  ('Sara / Midwest Nomad Family','@midwestnomadfamily','sara-midwest-nomad','creator-sara-road-trip','sara-road-trip'),
  ('Abbey / The Abbey Normal Blog','@theabbeynormalblog','abbey-normal','creator-abbey-neighborhood-scout','abbey-neighborhood-scout'),
  ('Mikayla Isabelle','@mikayla.isabelle','mikayla-isabelle','creator-mikayla-weekend-ready','mikayla-weekend-ready'),
  ('Braden Tewolde','@BradENSTL','braden-tewolde','creator-braden-kleenest-stop','braden-kleenest-stop'),
  ('STL Bucket List','@stlbucketlist','stl-bucket-list','creator-stl-bucket-list-weekend-map','stl-bucket-list-weekend-map'),
  ('Amy Funderburk','@amyfunderburk','amy-funderburk','creator-amy-real-stl-day','amy-real-stl-day'),
  ('Kelly Stumpe / The Car Mom','@the_car_mom','kelly-stumpe','creator-kelly-road-trip-prep','kelly-road-trip-prep')
)
insert into public.creator_mission_assignments(objective_id,creator_name,creator_handle,creator_slug,tracking_slug,campaign_code,default_channel,status)
select o.id,s.creator_name,s.creator_handle,s.creator_slug,s.tracking_slug,'kleenest-stl-creators-2026','social','draft'
from seed s
join public.progression_objectives_v2 o on o.code=s.mission_code
on conflict (tracking_slug) do update set
  objective_id=excluded.objective_id,
  creator_name=excluded.creator_name,
  creator_handle=excluded.creator_handle,
  creator_slug=excluded.creator_slug,
  campaign_code=excluded.campaign_code,
  default_channel=excluded.default_channel,
  updated_at=now();
