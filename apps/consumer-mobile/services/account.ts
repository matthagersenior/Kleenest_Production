import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type AccountDeletionRequest = {
  id: string;
  user_id: string;
  status: string;
  requested_at: string;
  processed_at: string | null;
  reason: string | null;
};

export async function requestAccountDeletion(reason=''): Promise<AccountDeletionRequest> {
  const { data, error } = await getKleenestSupabaseClient().rpc('request_account_deletion', {
    p_reason: reason.trim().slice(0, 1000) || null,
  });
  if (error) throw error;
  return data as AccountDeletionRequest;
}
