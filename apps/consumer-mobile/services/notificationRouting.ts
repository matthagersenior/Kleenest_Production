export type NotificationLike = {
  type?: string | null;
  data?: Record<string, unknown> | null;
};

export type NotificationContext='Restroom'|'Community'|'Support'|'Route'|'Progress'|'Intelligence'|'Kleenest';

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function safeInternalDestination(value:unknown){const next=stringValue(value);return next&&next.startsWith('/')&&!next.startsWith('//')?next:null}

function notificationParts(notification:NotificationLike){
  const data=notification?.data&&typeof notification.data==='object'?notification.data:{};
  const type=String(notification?.type||data.type||'').toLowerCase();
  return {data,type};
}
function isTrustMission(data:Record<string,unknown>,type:string){return Boolean(stringValue(data.mission_id)||type.includes('trust_mission'))}
function isProgress(data:Record<string,unknown>,type:string){return Boolean(isTrustMission(data,type)||stringValue(data.game_challenge_id)||stringValue(data.contest_id)||stringValue(data.quest_id)||type.includes('game')||type.includes('challenge')||type.includes('contest')||type.includes('quest')||type.includes('progress')||type.includes('badge')||type.includes('reward'))}

export function notificationContext(notification:NotificationLike):NotificationContext {
  const {data,type}=notificationParts(notification);
  if(stringValue(data.support_request_id)||type.includes('support'))return'Support';
  if(isProgress(data,type))return'Progress';
  if(stringValue(data.route_id)||type.includes('route'))return'Route';
  if(stringValue(data.location_id)||stringValue(data.locationId)||type.includes('remediation'))return'Restroom';
  if(type==='scheduled_report'||type.includes('intelligence')||type.startsWith('report_')||type.includes('trusted_place')||type.includes('popular_place')||type.includes('operational_attention')||type.includes('demand_opportunity')||type.includes('high_activity_zone'))return'Intelligence';
  if(stringValue(data.contributor_id)||stringValue(data.user_id)||stringValue(data.actor_user_id)||type==='review'||type.includes('follow')||type.includes('helpful')||type.includes('reply')||type.includes('community'))return'Community';
  return'Kleenest';
}

export function notificationDestination(notification: NotificationLike): string | null {
  const {data,type}=notificationParts(notification);
  const explicit=safeInternalDestination(data.destination);
  if(explicit)return explicit;
  if(stringValue(data.support_request_id)||type.includes('support'))return'/support';

  const locationId=stringValue(data.location_id)||stringValue(data.locationId);
  if(isTrustMission(data,type)&&locationId)return`/location/${encodeURIComponent(locationId)}`;
  if(isProgress(data,type))return stringValue(data.game_challenge_id)||type.includes('game')||type.includes('challenge')?'/games':'/play';
  if(stringValue(data.route_id)||type.includes('route'))return'/route';
  if(locationId)return`/location/${encodeURIComponent(locationId)}`;

  const contributorId=stringValue(data.contributor_id)||stringValue(data.user_id)||stringValue(data.actor_user_id);
  if(contributorId)return`/contributor/${encodeURIComponent(contributorId)}`;
  return null;
}
