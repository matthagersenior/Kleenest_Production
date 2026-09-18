insert into public.capability_function_classifications(function_signature,domain,classification,rationale,updated_at) values
('accept_current_policies()','consumer_safety','canonical','Authenticated acceptance of current Terms and Community policy versions before UGC participation.',now()),
('has_current_policy_acceptance()','consumer_safety','canonical','Authenticated policy-acceptance status used to gate community participation.',now()),
('current_policy_versions()','consumer_safety','supporting','Canonical policy-version metadata consumed by client legal surfaces.',now()),
('require_current_policy_acceptance()','consumer_safety','supporting','Server-side guard used by UGC enforcement triggers.',now()),
('enforce_ugc_policy_acceptance()','consumer_safety','trigger_helper','Database trigger helper that enforces accepted policies before UGC or messages are created.',now()),
('report_user(p_user_id uuid, p_reason text, p_details text, p_context text)','consumer_safety','canonical','Authenticated contributor reporting capability.',now()),
('report_review(p_review_id uuid, p_reason text, p_details text)','consumer_safety','canonical','Authenticated review reporting capability.',now()),
('block_user(p_user_id uuid)','consumer_safety','canonical','Authenticated block mutation; removes follow relationships and stops direct interaction.',now()),
('unblock_user(p_user_id uuid)','consumer_safety','canonical','Authenticated unblock mutation.',now()),
('list_my_blocked_users()','consumer_safety','canonical','Authenticated blocked-contributor management read.',now()),
('users_have_block_relationship(p_a uuid, p_b uuid)','consumer_safety','supporting','Shared server-side block relationship predicate used to suppress interactions and community visibility.',now()),
('report_ai_response(p_trace_id text, p_reason text, p_details text, p_task text, p_provider text, p_model text, p_answer_excerpt text)','ai_safety','canonical','Authenticated in-app AI response reporting with trace provenance for Trust and Safety.',now()),
('admin_list_ai_response_reports(p_status text)','owner_moderation','canonical','Platform-owner queue for AI safety reports.',now()),
('admin_resolve_ai_response_report(p_report_id uuid, p_status text, p_resolution text)','owner_moderation','canonical','Platform-owner resolution mutation for AI safety reports.',now())
on conflict (function_signature) do update set domain=excluded.domain,classification=excluded.classification,rationale=excluded.rationale,updated_at=now();
