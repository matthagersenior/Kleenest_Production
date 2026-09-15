update public.organic_hero_policies
set allowed_kinds=array['review_ready','active_mission','fresh_kleenest','check_in','saved_choice','top_ranked','next_objective','find_bathroom','share_knowledge','scan_qr']::text[],
    weights='{"review_ready":100,"active_mission":95,"fresh_kleenest":88,"check_in":82,"saved_choice":80,"top_ranked":75,"next_objective":70,"find_bathroom":60,"share_knowledge":45,"scan_qr":40}'::jsonb,
    updated_at=now()
where surface_code='consumer_home';
