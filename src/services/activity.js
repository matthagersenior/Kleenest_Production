import { getSupabase } from '../lib/supabase.js';
import { getLocations } from './locations.js';

export async function listMyActivity(limit = 40) {
  const client = getSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  const user = userData?.user;
  if (!user) throw new Error('Sign in to view your activity.');

  const [checkins, reviews, social] = await Promise.all([
    client.from('check_ins').select('id,location_id,checked_in_at,verification_method,points_awarded').eq('user_id', user.id).order('checked_in_at', { ascending: false }).limit(limit),
    client.from('reviews').select('id,location_id,stars,cleanliness_pct,comment,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(limit),
    client.from('social_activity').select('id,user_id,actor_user_id,activity_type,location_id,metadata,created_at').order('created_at', { ascending: false }).limit(limit),
  ]);
  for (const result of [checkins, reviews, social]) if (result.error) throw result.error;

  const events = [
    ...(checkins.data || []).map((row) => ({ id: `checkin:${row.id}`, kind: 'checkin', locationId: row.location_id, createdAt: row.checked_in_at, title: 'Checked in', detail: [row.verification_method, row.points_awarded ? `+${row.points_awarded} pts` : null].filter(Boolean).join(' · ') })),
    ...(reviews.data || []).map((row) => ({ id: `review:${row.id}`, kind: 'review', locationId: row.location_id, createdAt: row.created_at, title: `Left a ${row.stars}★ review`, detail: row.comment || (row.cleanliness_pct != null ? `${row.cleanliness_pct}% cleanliness` : '') })),
    ...(social.data || []).map((row) => ({ id: `social:${row.id}`, kind: 'social', locationId: row.location_id, createdAt: row.created_at, title: String(row.activity_type || 'Community activity').replaceAll('_', ' '), detail: row.metadata?.summary || '' })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);

  const locations = await getLocations(events.map((event) => event.locationId));
  const byId = new Map(locations.map((row) => [row.id, row]));
  return events.map((event) => ({ ...event, location: event.locationId ? byId.get(event.locationId) || null : null }));
}
