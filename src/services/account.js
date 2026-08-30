import { getSupabase } from '../lib/supabase.js';

export async function getAccountSummary() {
  const { data, error } = await getSupabase().rpc('user_subscription_summary');
  if (error) throw error;
  return data ?? { profile: null, subscriptions: [] };
}
