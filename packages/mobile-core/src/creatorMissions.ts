export const CREATOR_CAMPAIGN_CODE='kleenest-stl-creators-2026' as const;
export const KLEENEST_WEB_ORIGIN='https://kleenest.app' as const;

/**
 * Compatibility-only shape for callers that still type creator mission links.
 * Mission definitions are authoritative in Supabase and managed by KleenestOS.
 */
export type CreatorMission={
  creatorName:string;
  creatorHandle:string;
  creatorSlug:string;
  missionCode:string;
  trackingSlug:string;
  title:string;
  shortTitle:string;
  summary:string;
  steps:string[];
  primaryAction:string;
  target:number;
  xpReward:number;
  audience:string;
  cta:string;
};

/**
 * Static creator mission catalogs are intentionally empty.
 * Do not seed or operate missions from the client; use KleenestOS Creator Missions.
 */
export const CREATOR_MISSIONS:CreatorMission[]=[];

export function creatorMissionByTrackingSlug(_slug:string){
  return null;
}

export function creatorMissionTrackingUrl(mission:Pick<CreatorMission,'trackingSlug'>,channel='social'){
  return `${KLEENEST_WEB_ORIGIN}/creator?m=${encodeURIComponent(mission.trackingSlug)}&channel=${encodeURIComponent(channel)}`;
}
