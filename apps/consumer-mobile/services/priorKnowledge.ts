import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type PriorKnowledgeRecency =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'few_months'
  | 'long_time'
  | 'unknown';

export type PriorKnowledgeCleanliness =
  | 'usually_spotless'
  | 'usually_clean'
  | 'mixed'
  | 'often_needs_attention'
  | 'unknown';

export type PriorKnowledgeInput = {
  knowledgeRecency: PriorKnowledgeRecency;
  facts: string[];
  cleanlinessTendency: PriorKnowledgeCleanliness;
  accessNotes?: string;
  notes?: string;
};

export async function submitPriorKnowledge(locationId: string, input: PriorKnowledgeInput) {
  const { data, error } = await getKleenestSupabaseClient().rpc('consumer_submit_prior_knowledge', {
    p_location_id: locationId,
    p_input: {
      knowledge_recency: input.knowledgeRecency,
      facts: [...new Set(input.facts.map((value) => value.trim()).filter(Boolean))],
      cleanliness_tendency: input.cleanlinessTendency,
      access_notes: input.accessNotes?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });
  if (error) throw error;
  return data || {};
}
