import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type ResolvedConsumerSearchLocation = {
  latitude: number;
  longitude: number;
  label: string;
  category?: string | null;
  type?: string | null;
  importance?: number | null;
};

export async function resolveConsumerSearchLocation(query: string): Promise<ResolvedConsumerSearchLocation | null> {
  const normalized = String(query || '').trim().replace(/\s+/g, ' ');
  if (normalized.length < 2) return null;
  if (new TextEncoder().encode(normalized).length > 320) throw new Error('Location search is too long.');

  const { data, error } = await getKleenestSupabaseClient().functions.invoke('resolve-consumer-location', {
    body: { query: normalized },
  });
  if (error) throw new Error('Kleenest location search is temporarily unavailable. Try again.');

  const resolved = data?.resolved;
  const latitude = Number(resolved?.latitude);
  const longitude = Number(resolved?.longitude);
  if (!resolved || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    latitude,
    longitude,
    label: String(resolved.label || normalized),
    category: resolved.category == null ? null : String(resolved.category),
    type: resolved.type == null ? null : String(resolved.type),
    importance: Number.isFinite(Number(resolved.importance)) ? Number(resolved.importance) : null,
  };
}
