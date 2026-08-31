import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type AmenityCatalogItem = {
  id: string;
  name: string;
  category: string | null;
};

export type ReviewAmenityInventoryItem = {
  amenity_id: string;
  quantity: number | null;
  sentiment: 'good' | 'needs_attention';
};

export type LocationAmenityInventoryItem = {
  amenity_id: string;
  name: string;
  category: string | null;
  observed_quantity: number | null;
  sample_count: number;
  freshest_observed_at: string | null;
};

export type AmenityProgressionAward = {
  awarded?: boolean;
  points?: number;
  total_points?: number;
  level?: number;
  streak?: number;
  reason?: string;
  review_id?: string;
  location_id?: string;
  check_in_id?: string;
  amenity_observations?: number;
};

export async function listAmenityCatalog(): Promise<AmenityCatalogItem[]> {
  const { data, error } = await getKleenestSupabaseClient()
    .from('amenities')
    .select('id,name,category')
    .order('category')
    .order('name');
  if (error) throw error;
  return (data || []) as AmenityCatalogItem[];
}

export async function listLocationAmenityInventory(locationId: string): Promise<LocationAmenityInventoryItem[]> {
  const { data, error } = await getKleenestSupabaseClient().rpc('get_location_amenity_inventory', {
    p_location_id: locationId,
  });
  if (error) throw error;
  return Array.isArray(data) ? (data as LocationAmenityInventoryItem[]) : [];
}

export async function awardReviewAmenityProgression(reviewId: string): Promise<AmenityProgressionAward> {
  const { data, error } = await getKleenestSupabaseClient().rpc('award_review_amenity_progression', {
    p_review_id: reviewId,
  });
  if (error) throw error;
  return (data || {}) as AmenityProgressionAward;
}

export async function recordReviewAmenityInventory(
  reviewId: string,
  items: ReviewAmenityInventoryItem[],
) {
  const normalized = items.map((item) => {
    const quantity = item.quantity == null ? null : Number(item.quantity);
    if (quantity != null && (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000)) {
      throw new Error('Amenity counts must be whole numbers from 0 to 1000.');
    }
    return {
      amenity_id: item.amenity_id,
      quantity,
      sentiment: item.sentiment,
    };
  });

  const { data, error } = await getKleenestSupabaseClient().rpc('record_review_amenity_inventory', {
    p_review_id: reviewId,
    p_items: normalized,
  });
  if (error) throw error;

  // Inventory persistence is the canonical user action. Progression is an optional,
  // eligibility-gated bonus and must never make a successfully saved review appear failed.
  const progression = normalized.length
    ? await awardReviewAmenityProgression(reviewId).catch(() => null)
    : null;
  return { inventory: data, progression };
}
