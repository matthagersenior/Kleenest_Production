import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

const LOCATION_BUCKET = 'location-photos';

export type ConsumerLocationPresentation = {
  location_id: string;
  consumer_photo_id: string | null;
  consumer_photo_storage_path: string | null;
  consumer_photo_caption: string | null;
  consumer_photo_is_featured: boolean;
  consumer_photo_created_at: string | null;
  consumer_photo_url: string | null;
};

export function publicLocationPhotoUrl(storagePath: string | null | undefined) {
  const path = String(storagePath || '').trim();
  if (!path) return null;
  return getKleenestSupabaseClient().storage.from(LOCATION_BUCKET).getPublicUrl(path).data.publicUrl || null;
}

export async function listLocationPresentations(locationIds: string[]): Promise<ConsumerLocationPresentation[]> {
  const ids = [...new Set((locationIds || []).map(String).filter(Boolean))].slice(0, 200);
  if (!ids.length) return [];
  const { data, error } = await getKleenestSupabaseClient().rpc('mobile_location_presentation_v1', {
    p_location_ids: ids,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: any) => ({
    location_id: String(row.location_id),
    consumer_photo_id: row.consumer_photo_id ? String(row.consumer_photo_id) : null,
    consumer_photo_storage_path: row.consumer_photo_storage_path ? String(row.consumer_photo_storage_path) : null,
    consumer_photo_caption: row.consumer_photo_caption ? String(row.consumer_photo_caption) : null,
    consumer_photo_is_featured: row.consumer_photo_is_featured === true,
    consumer_photo_created_at: row.consumer_photo_created_at ? String(row.consumer_photo_created_at) : null,
    consumer_photo_url: publicLocationPhotoUrl(row.consumer_photo_storage_path),
  }));
}

export async function attachLocationPresentations<T extends Record<string, any>>(rows: T[]): Promise<T[]> {
  const ids = rows.map((row) => String(row.location_id || row.id || '')).filter(Boolean);
  const presentations = await listLocationPresentations(ids);
  const byId = new Map(presentations.map((item) => [item.location_id, item]));
  return rows.map((row) => {
    const id = String(row.location_id || row.id || '');
    const presentation = byId.get(id);
    return presentation ? { ...row, ...presentation } : row;
  });
}

export async function getLocationPresentation(locationId: string) {
  const rows = await listLocationPresentations([locationId]);
  return rows[0] || null;
}
