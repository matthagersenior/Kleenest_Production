const DEFAULT_WEB_ORIGIN = 'https://kleenest.app';

export function placeDeepLink(placeId: string, origin = DEFAULT_WEB_ORIGIN): string {
  const id = String(placeId || '').trim();
  if (!id) throw new Error('placeId is required');
  return `${origin.replace(/\/$/, '')}/place/${encodeURIComponent(id)}`;
}

export function routeDeepLink(routeId: string, origin = DEFAULT_WEB_ORIGIN): string {
  const id = String(routeId || '').trim();
  if (!id) throw new Error('routeId is required');
  return `${origin.replace(/\/$/, '')}/route/${encodeURIComponent(id)}`;
}

export function nativePlaceDeepLink(placeId: string): string {
  const id = String(placeId || '').trim();
  if (!id) throw new Error('placeId is required');
  return `kleenest://place/${encodeURIComponent(id)}`;
}
