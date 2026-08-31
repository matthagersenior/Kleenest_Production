export type NotificationLike = {
  type?: string | null;
  data?: Record<string, unknown> | null;
};

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function notificationDestination(notification: NotificationLike): string | null {
  const data = notification?.data && typeof notification.data === 'object' ? notification.data : {};
  const type = String(notification?.type || data.type || '').toLowerCase();
  const locationId = stringValue(data.location_id) || stringValue(data.locationId);
  if (locationId) return `/location/${encodeURIComponent(locationId)}`;

  const contributorId = stringValue(data.contributor_id) || stringValue(data.user_id) || stringValue(data.actor_user_id);
  if (contributorId) return `/contributor/${encodeURIComponent(contributorId)}`;

  if (stringValue(data.game_challenge_id) || type.includes('game') || type.includes('challenge')) return '/games';
  if (stringValue(data.contest_id) || stringValue(data.quest_id) || type.includes('contest') || type.includes('quest') || type.includes('progress') || type.includes('badge') || type.includes('reward')) return '/play';
  if (stringValue(data.route_id) || type.includes('route')) return '/route';
  return null;
}
