-- Lock down previously exposed tables and add least-privilege policies.
ALTER TABLE public.business_metric_leaderboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progression_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progression_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progression_challenges ENABLE ROW LEVEL SECURITY;

-- Business leaderboard: public/authenticated read only; writes remain server-side.
CREATE POLICY business_metric_leaderboards_select_authenticated
ON public.business_metric_leaderboards
FOR SELECT TO authenticated
USING (true);

-- Progression catalog: authenticated users may read enabled definitions; writes remain server-side/admin RPC.
CREATE POLICY progression_actions_select_enabled
ON public.progression_actions
FOR SELECT TO authenticated
USING (enabled = true);

CREATE POLICY progression_games_select_enabled
ON public.progression_games
FOR SELECT TO authenticated
USING (enabled = true);

CREATE POLICY progression_challenges_select_enabled
ON public.progression_challenges
FOR SELECT TO authenticated
USING (enabled = true);

-- Support: users may create and view their own tickets. Admin mutation is handled by protected admin paths.
CREATE POLICY support_requests_insert_own
ON public.support_requests
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY support_requests_select_own
ON public.support_requests
FOR SELECT TO authenticated
USING (user_id = auth.uid());
