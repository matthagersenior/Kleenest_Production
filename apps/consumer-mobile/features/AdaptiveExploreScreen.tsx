Warning: truncated output (original token count: 40851)
Total output lines: 2681

import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import {
  buildMobileRoute,
  buildMobileRouteToDestination,
  dedupePhysicalPlaceRows,
  findAdaptiveNearbyPlaces,
  refreshNearbyPlaceInventory,
  findAdaptiveNearbyRestrooms,
  listNearbyMapCandidates,
  listNearbyRestrooms,
  listPlacesAlongRoute,
  mobileCheckIn,
  getKleenestSupabaseClient,
  listMobileFavoriteLocations,
  toggleMobileFavorite,
  BATHROOM_FIT_OPTIONS,
  getBathroomFitPreferences,
  type AmenityMatchRule,
} from '@kleenest/mobile-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  FlatList,
  Modal,
  Platform,
   Pressable,
   ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { listAmenityCatalog, type AmenityCatalogItem } from '../services/amenities';
import { discoveryPlaceName, discoveryListingReference } from '../services/discoveryPresentation';
import { visitFreshness } from '../services/evidenceFormatting';
import { attachLocationNetwork, attachLocationTrust, listLocationNetworkStatuses, listLocationTrustSummaries, networkEvidenceSummary } from '../services/locationTrust';
import { useConsumerTheme } from '../services/theme';
import { resolveConsumerSearchLocation } from '../services/locationResolver';
import { interpretDiscoveryIntent, resolveIntentAmenityNames, shouldInterpretDiscoveryQuery, type DiscoveryIntent } from '../services/discoveryIntent';
import {
  cachedAgeLabel,
  readNearbyCache,
  readNearbyContinuity,
  takeExploreReturnState,
  writeExploreReturnState,
  writeNearbyCache,
  writeNearbyContinuity,
} from '../services/nearbyCache';
import { captureConsumerCoreLoopEvent, captureConsumerDiscovery, captureConsumerRouteIntent } from '../services/consumerTelemetry';
import { captureAcquisitionEvent } from '../services/acquisitionAttribution';
import { publishConsumerWidgetSnapshot } from '../services/consumerWidgets';
import { listNearbyProgressionOpportunities } from '../services/discoveryProgression';
import { getRewardCapabilities } from '../services/rewardRuntime';
import { attachLocationPresentations } from '../services/locationPresentation';
import { recordConsumerPresenceAt, refreshConsumerPresence, type ConsumerPresence } from '../services/presence';
import {
  CompactRestroomSignals,
  DecisionRestroomSignals,
  MapLegend,
  PlaceIcon,
  FreshnessHeatRing,
  restroomMarkerLabel,
} from '../components/RestroomSignals';
import { palette } from '../components/ConsumerUI';
import { SponsoredSlot } from '../components/SponsoredSlot';
import { AdMobNativeSlot } from '../components/AdMobNativeSlot';
import { GuestInstallUpsell } from '../components/GuestInstallUpsell';
import { organicExploreReason } from '../services/aiAssist';

const DRAFT_KEY = 'kleenest.native.route.draft';
const SEARCH_DESTINATION_GEOFENCE_RADIUS_M=150;
const LIVE_LOOKUP_TIMEOUT_MS=8000;
const LIVE_FALLBACK_TIMEOUT_MS=4500;
const PRESENCE_LOOKUP_TIMEOUT_MS=3000;
const LOCATION_LOOKUP_TIMEOUT_MS=6000;

function withTimeout<T>(promise:Promise<T>,timeoutMs:number,message:string):Promise<T>{
  return new Promise<T>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(message)),timeoutMs);
    promise.then(
      value=>{clearTimeout(timer);resolve(value);},
      error=>{clearTimeout(timer);reject(error);},
    );
  });
}
function isLookupTimeout(error:unknown){
  return /took too long|timed out|timeout/i.test(String((error as any)?.message||error||''));
}
function friendlyExploreError(error:unknown,fallback='Kleenest could not finish that search. Please try again.'){
  const detail=String((error as any)?.message||error||'').trim();
  if(!detail)return fallback;
  if(/statement timeout|cancel(?:l)?ing statement|PGRST|SQLSTATE|schema cache|relation .* does not exist|column .* does not exist|permission denied|fetch failed|network request failed|failed to fetch|internal server error|500\b/i.test(detail)){
    return /route|corridor/i.test(detail)?'Kleenest could not finish the route search in time. Try again, or narrow the route filters.':fallback;
  }
  if(isLookupTimeout(error))return /route|corridor/i.test(detail)?'Kleenest could not finish the route search in time. Try again, or narrow the route filters.':'Kleenest is taking too long to search right now. Please try again.';
  return detail.length<=140?detail:fallback;
}
const OSM_STYLE: any = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};
const radiusChoices = [
  { label: '1 mi', meters: 1609 },
  { label: '2 mi', meters: 3219 },
  { label: '5 mi', meters: 8047 },
  { label: '10 mi', meters: 16093 },
  { label: '25 mi', meters: 40234 },
];
const maxChoices = [
  { label: '25 mi', meters: 40234 },
  { label: '50 mi', meters: 80467 },
  { label: '100 mi', meters: 160934 },
  { label: '250 mi', meters: 402336 },
];
const corridorChoices = [
  { label: '5 mi', meters: 8047 },
  { label: '10 mi', meters: 16093 },
  { label: '15 mi', meters: 24140 },
];
const FILTER_CATEGORIES = new Set([
  'Accessibility',
  'Facilities',
  'Family',
  'Fixtures',
  'Hours',
  'Hygiene',
  'Restroom',
  'Safety',
]);

const idOf = (row: any) => String(row?.location_id || row?.place_id || row?.id || '');
type CheckInActionFeedback = {
  status: 'checking' | 'success' | 'error';
  message: string;
  reviewReady?: boolean;
  verificationExpiresAt?: string | null;
  pointsAwarded?: number;
  progressionCapReached?: boolean;
  alreadyCheckedIn?: boolean;
};
function attachPresence(rows:any[],presence:ConsumerPresence|null){
  if(!presence?.check_in_available||!presence.location_id)return rows;
  const locationId=String(presence.location_id);
  return rows.map(row=>idOf(row)===locationId?{...row,visit_verification_available:true,visit_inside_geofence:Boolean(presence.inside_geofence),visit_verification_expires_at:presence.verification_expires_at||null}:row);
}
const hasCoordinates = (row: any) =>
  Number.isFinite(Number(row?.latitude)) && Number.isFinite(Number(row?.longitude));
const miles = (meters: any) =>
  Number.isFinite(Number(meters)) ? Number(meters) / 1609.344 : null;
const distanceLabel = (meters: any) => {
  const value = miles(meters);
  if (value == null) return '—';
  return `${value.toFixed(value < 10 ? 1 : 0)} mi`;
};
type MapMarkerGroup={key:string;rows:any[];center:[number,number]};
function markerClusterCellDegrees(zoom:number){
  if(zoom<11)return .03;
  if(zoom<12)return .018;
  if(zoom<13)return .010;
  if(zoom<14)return .0065;
  if(zoom<15)return .003;
  if(zoom<16)return .0014;
  if(zoom<17)return .00065;
  return 0;
}
function organizeMapMarkers(rows:any[],zoom:number):MapMarkerGroup[]{
  const usable=(rows||[]).filter(hasCoordinates);
  const cell=markerClusterCellDegrees(zoom)||0.00001;
  const buckets=new globalThis.Map<string,any[]>();
  for(const row of usable){
    const lng=Number(row.longitude),lat=Number(row.latitude);
    const key=`${Math.floor((lng+180)/cell)}:${Math.floor((lat+90)/cell)}`;
    const bucket=buckets.get(key)||[];
    bucket.push(row);
    buckets.set(key,bucket);
  }
  return [...buckets.entries()].map(([key,bucket])=>{
    // Cluster badges must be anchored to a real member's coordinates rather
    // than floating between buildings at the arithmetic center of several POIs.
    const longitude=bucket.reduce((sum,row)=>sum+Number(row.longitude),0)/bucket.length;
    const latitude=bucket.reduce((sum,row)=>sum+Number(row.latitude),0)/bucket.length;
    const squaredDistance=(row:any)=>Math.pow(Number(row.longitude)-longitude,2)+Math.pow(Number(row.latitude)-latitude,2);
    const anchor=bucket.reduce((best,row)=>squaredDistance(row)<squaredDistance(best)?row:best,bucket[0]);
    return {key:`cluster:${key}`,rows:bucket,center:[Number(anchor.longitude),Number(anchor.latitude)]};
  });
}
function exploreCameraViewState(bounds:any,fitRoute:boolean,center:any,zoom:number){
  return bounds&&fitRoute
    ? {bounds,padding:{top:28,right:28,bottom:28,left:28}}
    : {center,zoom};
}
const DENSITY_CAMERA_FALLBACK_ZOOM=13;
function densityAwareInitialZoom(rows:any[],origin:[number,number],fallback=DENSITY_CAMERA_FALLBACK_ZOOM){
  const usable=(rows||[]).filter(hasCoordinates);
  if(!usable.length)return fallback;
  const nearby=usable.map(row=>{
    const lat1=origin[1]*Math.PI/180,lat2=Number(row.latitude)*Math.PI/180;
    const dLat=lat2-lat1,dLng=(Number(row.longitude)-origin[0])*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
    return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
  });
  const withinHalfMile=nearby.filter(distance=>distance<=805).length;
  const withinMile=nearby.filter(distance=>distance<=1609).length;
  if(withinHalfMile>=80)return 16;
  if(withinHalfMile>=40||withinMile>=120)return 15.5;
  if(withinMile>=60)return 15;
  if(withinMile>=30)return 14.5;
  if(withinMile>=15)return 14;
  if(usable.length<=6)return 12.5;
  return fallback;
}
const verificationWindowLabel = (value: string | null | undefined) => {
  if (!value) return '';
  const expires = new Date(value).getTime();
  if (!Number.isFinite(expires)) return '';
  const remaining = Math.max(0, expires - Date.now());
  if (remaining <= 0) return 'review window ending now';
  const minutes = Math.max(1, Math.ceil(remaining / 60000));
  return minutes >= 60 ? `${Math.ceil(minutes / 60)}h verified review window` : `${minutes}m verified review window`;
};
const radiusLabel = (meters: number) => `${Math.round(meters / 1609.344)} mi`;
const looksLikeAddressOrArea = (value: string) => {
  const query=value.trim();
  if(shouldInterpretDiscoveryQuery(query))return false;
  return Boolean(query) && (
    /\d/.test(query)
    || /,/.test(query)
    || /\b\d{5}(?:-\d{4})?\b/.test(query)
    || /\s[A-Z]{2}$/i.test(query)
    || /\b(street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|highway|hwy\.?|parkway|pkwy\.?|court|ct\.?|circle|place|plaza|way)\b/i.test(query)
    || /\b(school|academy|college|university|campus|hospital|clinic|medical center|airport|station|terminal|park|library|church|synagogue|mosque|temple|stadium|arena|museum|hotel|motel|resort|courthouse|city hall)\b/i.test(query)
  );
};
const navigateUrl = (row: any, activeRoute?: any) => {
  const destination=Array.isArray(activeRoute?.destinationCoordinates)&&activeRoute.destinationCoordinates.length===2
    ? activeRoute.destinationCoordinates
    : null;
  const origin=Array.isArray(activeRoute?.originCoordinates)&&activeRoute.originCoordinates.length===2
    ? activeRoute.originCoordinates
    : null;
  if(activeRoute?.directDestination&&destination&&origin&&hasCoordinates(row)){
    const params=new URLSearchParams({
      api:'1',
      origin:`${origin[1]},${origin[0]}`,
      destination:`${destination[1]},${destination[0]}`,
      travelmode:'driving',
      waypoints:`${row.latitude},${row.longitude}`,
    });
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${row.latitude},${row.longitude}`)}&travelmode=driving`;
};

const ratingOf=(row:any)=>{const value=Number(row?.rating ?? row?.average_rating ?? row?.star_rating ?? 0);return Number.isFinite(value)?value:0;};
const freshestEvidenceAt=(row:any)=>{const values=[row?.network?.latest_evidence_at,row?.trust?.latest_verified_at,row?.trust?.latest_amenity_observed_at,row?.consumer_photo_created_at].map((value:any)=>value?new Date(value).getTime():NaN).filter((value:number)=>Number.isFinite(value));return values.length?Math.max(...values):null;};
const isKleenestPlace=(row:any)=>Boolean(row?.kleenest_business||row?.business_tier);
const kleenestDiscoveryRank=(row:any)=>isKleenestPlace(row)?4:row?.network?.network_verified?3:row?.network?.business_claimed?2:row?.network?.network_state==='building'?1:0;
const amenityDiscoveryRank=(row:any,requested:string[])=>requested.length?matchedRequestedAmenities(row,requested).length:(Array.isArray(row?.amenities)?row.amenities.length:0);
function organizeDiscoveryRows(rows:any[],requested:string[]){
  const ordered=[...(rows||[])].sort((a,b)=>{
    const freshness=(freshestEvidenceAt(b)||0)-(freshestEvidenceAt(a)||0);
    if(freshness!==0)return freshness;
    const kleenest=kleenestDiscoveryRank(b)-kleenestDiscoveryRank(a);
    if(kleenest!==0)return kleenest;
    const amenities=amenityDiscoveryRank(b,requested)-amenityDiscoveryRank(a,requested);
    if(amenities!==0)return amenities;
    return Number(a?.distance_meters||Number.MAX_SAFE_INTEGER)-Number(b?.distance_meters||Number.MAX_SAFE_INTEGER);
  });
  return ordered.map((row,index)=>({...row,discovery_recommended:index===0,discovery_rank:index+1}));
}
function recommendationReason(row:any,requested:string[]){
  const parts:string[]=[];
  const fresh=freshestEvidenceAt(row);
  if(fresh)parts.push('freshest evidence');
  if(isKleenestPlace(row))parts.push('Kleenest place');
  else if(row?.network?.network_verified)parts.push('Kleenest Network verified');
  const matches=matchedRequestedAmenities(row,requested).length;
  if(matches)parts.push(`${matches} requested amenit${matches===1?'y':'ies'}`);
  return parts.length?parts.join(' · '):'best nearby fit';
}
const isFreshWithinDays=(row:any,days:number|null)=>{if(!days)return true;const time=freshestEvidenceAt(row);return time!=null&&Date.now()-time<=days*86400000;};
const hasVerifiedEvidence=(row:any)=>Boolean(row?.network?.network_verified)||Number(row?.trust?.verified_visit_count||0)>0;
const hasEvidenceGap=(row:any)=>{const fresh=freshestEvidenceAt(row);const stale=!fresh||Date.now()-fresh>30*86400000;const visits=Math.max(Number(row?.trust?.verified_visit_count||0),Number(row?.network?.verified_visits||0));return stale||visits<2||Boolean(row?.needs_restroom_verification);};
const hasRestroomSignal=(row:any)=>{const category=String(row?.category||row?.place_type||'').toLowerCase();if(['restroom','bathroom','toilet'].includes(category))return true;return Array.isArray(row?.amenities)&&row.amenities.some((entry:any)=>/^(public )?(restroom|bathroom|toilet|toilets)$/i.test(String(typeof entry==='string'?entry:entry?.name||'').trim()));};

function trustSummaryLine(item: any) {
  const trust = item?.trust;
  const visits = Number(trust?.verified_visit_count || 0);
  const photos = Number(trust?.photo_evidence_count || 0);
  const amenities = Number(trust?.amenity_evidence_count || 0);
  const fresh = visitFreshness(trust?.latest_verified_at);
  const parts = [
    visits ? `${visits} verified visit${visits === 1 ? '' : 's'}` : null,
    photos ? `${photos} photo${photos === 1 ? '' : 's'}` : null,
    amenities ? `${amenities} amenity evidence` : null,
    fresh || null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Community evidence building';
}
function trustEvidenceLine(item:any){
  const trust=item?.trust||{};
  const network=item?.network||{};
  const confirmations=Math.max(Number(trust?.verified_visit_count||0),Number(network?.verified_visits||0));
  const photos=Number(trust?.photo_evidence_count||0);
  const amenities=Number(trust?.amenity_evidence_count||0);
  const contradictionRaw=trust?.contradiction_count??network?.contradiction_count;
  const contradictions=contradictionRaw==null?null:Number(contradictionRaw);
  const fresh=visitFreshness(trust?.latest_verified_at||network?.latest_evidence_at);
  const parts=[
    fresh?`Freshness: ${fresh}`:null,
    confirmations?`${confirmations} independent verified visit${confirmations===1?'':'s'}`:null,
    photos?`${photos} photo evidence`:null,
    amenities?`${amenities} amenity confirmation${amenities===1?'':'s'}`:null,
    contradictions!=null&&Number.isFinite(contradictions)&&contradictions>0?`${contradictions} contradiction signal${contradictions===1?'':'s'} to review`:null,
  ].filter(Boolean);
  return parts.length?parts.join(' · '):'Evidence is still building. Another independent visit can make this recommendation stronger.';
}

function matchedRequestedAmenities(item: any, requested: string[]) {
  if (!requested.length || !Array.isArray(item?.amenities)) return [] as string[];
  const available = new Set(
    item.amenities
      .map((entry: any) => String(typeof entry === 'string' ? entry : entry?.name || '').trim().toLowerCase())
      .filter(Boolean),
  );
  return requested.filter((name) => available.has(String(name).trim().toLowerCase()));
}

function matchExplanationLines(item:any,requested:string[],route:any){
  const lines:string[]=[];
  const matches=matchedRequestedAmenities(item,requested);
  if(matches.length)lines.push('Matches '+matches.slice(0,3).join(', '));
  const fresh=visitFreshness(item?.trust?.latest_verified_at||item?.network?.latest_evidence_at||item?.updated_at);
  if(fresh)lines.push('Evidence '+fresh.toLowerCase());
  const confirmations=Math.max(Number(item?.trust?.verified_visit_count||0),Number(item?.network?.verified_visits||0));
  if(confirmations>0)lines.push(String(confirmations)+' verified visit'+(confirmations===1?'':'s'));
  if(item?.network?.network_verified)lines.push('Kleenest Network verified');
  const clean=Number(item?.cleanliness_pct);
  if(Number.isFinite(clean)&&clean>0)lines.push(Math.round(clean)+'% cleanliness from recorded evidence');
  if(route&&Number.isFinite(Number(item?.distance_to_route_meters)))lines.push(distanceLabel(item.distance_to_route_meters)+' off route');
  else if(Number.isFinite(Number(item?.distance_meters)))lines.push(distanceLabel(item.distance_meters)+' away');
  return Array.from(new Set(lines)).slice(0,4);
}

function RequestedAmenityMatches({ item, requested, compact = false }: {
  item: any;
  requested: string[];
  compact?: boolean;
}) {
  const theme=useConsumerTheme();
  const matches = matchedRequestedAmenities(item, requested);
  if (!matches.length) return null;
  return (
    <View style={s.amenityMatchRow}>
      {!compact ? <Text style={[s.amenityMatchLabel,{color:theme.muted}]}>MATCHED</Text> : null}
      {matches.slice(0, compact ? 3 : 5).map((name) => (
        <View key={name} style={[s.amenityMatchPill,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}>
          <Text style={[s.amenityMatchText,{color:theme.accent}]}>✓ {name}</Text>
        </View>
      ))}
    </View>
  );
}

function parseRouteDraft(raw: string | null) {
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).filter(Boolean).slice(0, 50);
  } catch {
    return [] as string[];
  }
}

function CheckInStatus({ feedback, onReview }: { feedback?: CheckInActionFeedback; onReview?: () => void }) {
  const theme=useConsumerTheme();
  if(!feedback)return null;
  const isError=feedback.status==='error';
  const isChecking=feedback.status==='checking';
  const windowLabel=feedback.status==='success'?verificationWindowLabel(feedback.verificationExpiresAt):'';
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        s.checkInStatus,
        {
          backgroundColor:isError?theme.surfaceRaised:theme.accentSoft,
          borderColor:isError?theme.danger:theme.line,
        },
      ]}
    >
      <Text style={[s.checkInStatusText,{color:isError?theme.danger:theme.accent}]}>
        {isChecking?'⌖ ':feedback.status==='success'?'✓ ':'! '}{feedback.message}
      </Text>
      {windowLabel?<Text style={[s.checkInStatusMeta,{color:theme.muted}]}>Verification remains usable after you leave · {windowLabel}</Text>:null}
      {feedback.status==='success'&&feedback.reviewReady&&onReview?(
        <Pressable accessibilityRole="button" accessibilityLabel="Review this verified visit" onPress={onReview} style={[s.checkInReviewAction,{backgroundColor:theme.accent}]}>
          <Text style={[s.checkInReviewText,{color:theme.accentText}]}>Review verified visit</Text>
        </Pressable>
      ):null}
    </View>
  );
}

function ResultCard({ item, selected, onSelect, onDirections, onCheckIn, onAddToRoute, onKnow, onDetails, onReview, route, requestedAmenities, checkInFeedback }: {
  item: any;
  selected: boolean;
  onSelect: () => void;
  onDirections: () => void;
  onCheckIn: () => void;
  onAddToRoute: () => void;
  onKnow: () => void;
  onDetails: () => void;
  onReview: () => void;
  route: any;
  requestedAmenities: string[];
  checkInFeedback?: CheckInActionFeedback;
}) {
  const theme=useConsumerTheme();
  const fraction = Math.max(0, Math.min(1, Number(item.route_fraction || 0)));
  const ahead = route ? Math.max(0, Number(route.distanceMiles || 0) * fraction) : null;
  const eta = route ? Math.max(0, Number(route.durationMinutes || 0) * fraction) : null;
  const reviewCount = Number(item.review_count || 0);
  const checkInBusy=checkInFeedback?.status==='checking';
  const [showTrustEvidence,setShowTrustEvidence]=useState(false);
  const [showMatchEvidence,setShowMatchEvidence]=useState(false);
  const [showMoreActions,setShowMoreActions]=useState(false);
  const matchLines=matchExplanationLines(item,requestedAmenities,route);
  return (
    <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}, selected && s.cardActive]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${discoveryPlaceName(item)}, ${route && ahead != null ? `${ahead.toFixed(ahead < 10 ? 1 : 0)} miles ahead` : distanceLabel(item.distance_meters)}`}
        onPress={onSelect}
        style={s.cardMain}
      >
        <View style={s.cardTop}>
          <FreshnessHeatRing item={item} size={34} photoUrl={item.consumer_photo_url ? String(item.consumer_photo_url) : undefined} />
          <View style={{ flex: 1 }}>
            <View style={s.cardTitleRow}>
              <Text style={[s.cardTitle,{color:theme.ink}]}>{discoveryPlaceName(item)}</Text>
              {item.discovery_recommended?<View style={[s.recommendedBadge,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}><Text style={[s.recommendedBadgeText,{color:theme.accent}]}>RECOMMENDED</Text></View>:null}
            </View>
            {item.discovery_recommended?<Text style={[s.recommendedReason,{color:theme.muted}]}>{recommendationReason(item,requestedAmenities)}</Text>:null}
            {item.business_name ? <Text style={[s.meta,{color:theme.muted}]}>{item.business_name}</Text> : null}
            <Text style={[s.meta,{color:theme.muted}]}>
              {[item.address, item.city, item.state].filter(Boolean).join(', ') || 'Address unavailable'}
            </Text>
          </View>
          <Text style={[s.distance,{color:theme.accent}]}>
            {route && ahead != null
              ? `~${ahead.toFixed(ahead < 10 ? 1 : 0)} mi ahead`
              : distanceLabel(item.distance_meters)}
          </Text>
        </View>
        {route && eta != null ? (
          <Text style={[s.routeLine,{color:theme.muted}]}>
            ~{Math.round(eta)} min ahead · {distanceLabel(item.distance_to_route_meters)} from route
          </Text>
        ) : null}
        <CompactRestroomSignals item={item} />
        <RequestedAmenityMatches item={item} requested={requestedAmenities} />
        {matchLines.length?<View style={s.trustSummaryRow}>
          <Text style={[s.trustLine,{color:theme.muted}]}>{matchLines[0]}</Text>
          <Pressable accessibilityRole="button" accessibilityState={{expanded:showMatchEvidence}} onPress={()=>setShowMatchEvidence(value=>!value)} hitSlop={8}>
            <Text style={[s.trustWhy,{color:theme.accent}]}>{showMatchEvidence?'Hide match details':'Why this match?'}</Text>
          </Pressable>
        </View>:null}
        {showMatchEvidence&&matchLines.length?<View style={[s.trustEvidenceBox,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
          {matchLines.map((line,index)=><Text key={line+String(index)} style={[s.trustEvidenceText,{color:theme.ink}]}>• {line}</Text>)}
        </View>:null}
        <View style={s.trustSummaryRow}>
          <Text style={[s.trustLine,{color:theme.ink}]}>{trustSummaryLine(item)}</Text>
          <Pressable accessibilityRole="button" accessibilityState={{expanded:showTrustEvidence}} onPress={()=>setShowTrustEvidence(value=>!value)} hitSlop={8}>
            <Text style={[s.trustWhy,{color:theme.accent}]}>{showTrustEvidence?'Hide evidence':'Why trusted?'}</Text>
          </Pressable>
        </View>
        {showTrustEvidence?<View style={[s.trustEvidenceBox,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
          <Text style={[s.trustEvidenceText,{color:theme.ink}]}>{trustEvidenceLine(item)}</Text>
          {item.network?.network_verified&&!item.network?.business_claimed?<Text style={[s.networkSelectedLine,{color:theme.accent}]}>K✓ Kleenest Network verified · {networkEvidenceSummary(item.network)}</Text>:null}
        </View>:null}
        {reviewCount > 0 ? <Text style={[s.meta,{color:theme.muted}]}>{reviewCount} review{reviewCount === 1 ? '' : 's'}</Text> : null}
      </Pressable>
      <View style={s.cardActionRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Start directions to this location" accessibilityHint="Start navigation" disabled={!hasCoordinates(item)} style={[s.primarySmall,s.cardAction,{backgroundColor:theme.accent},!hasCoordinates(item)&&s.disabled]} onPress={onDirections}>
          <Text style={[s.primaryText,{color:theme.accentText}]}>Go →</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open full location details" style={[s.secondarySmall,s.cardAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={onDetails}>
          <Text style={[s.secondaryText,{color:theme.accent}]}>Full details</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={showMoreActions?'Hide more actions':'Show more actions'} accessibilityState={{expanded:showMoreActions}} style={[s.secondarySmall,s.cardAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={()=>setShowMoreActions(value=>!value)}>
          <Text style={[s.secondaryText,{color:theme.accent}]}>{showMoreActions?'Less':'More •••'}</Text>
        </Pressable>
      </View>
      {showMoreActions?<View style={s.cardActionRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={item.active_check_in?'Already checked in at this location':checkInBusy?'Checking your location':item.visit_verification_available?'Verify your detected visit at this location':'Verify that I am at this location'} accessibilityHint="Check in" accessibilityState={{disabled:Boolean(item.active_check_in)||checkInBusy,busy:checkInBusy}} disabled={Boolean(item.active_check_in)||checkInBusy} style={[s.secondarySmall,s.cardAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line},(item.active_check_in||checkInBusy)&&s.disabled]} onPress={onCheckIn}>
          <Text style={[s.secondaryText,{color:theme.accent}]}>{item.active_check_in?'Checked in ✓':checkInBusy?'Checking…':item.visit_verification_available?'Verify visit':"I'm here"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Add this location to my route" style={[s.secondarySmall,s.cardAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={onAddToRoute}>
          <Text style={[s.secondaryText,{color:theme.accent}]}>Add to route</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Share what I already know about this location" style={[s.secondarySmall,s.cardAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={onKnow}>
          <Text style={[s.secondaryText,{color:theme.accent}]}>I know this place</Text>
        </Pressable>
      </View>:null}
      <CheckInStatus feedback={checkInFeedback} onReview={onReview} />
    </View>
  );
}

export default function AdaptiveExploreScreen() {
 const theme=useConsumerTheme();
   const {height:windowHeight}=useWindowDimensions();
  const exploreMapHeight=Math.max(520,Math.round(windowHeight-(Platform.OS==='web'?86:82)));
  const listRef=useRef<any>(null);
  const cameraRef=useRef<any>(null);
  const mapGestureReleaseRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const nearbyEnrichmentRunRef=useRef(0);
  const cameraInteractionVersionRef=useRef(0);
  const activeIntentRef=useRef<DiscoveryIntent|null>(null);
  const activeIntentAmenitiesRef=useRef<string[]|null>(null);
  const [mode, setMode] = useState<'nearby' | 'route'>('nearby');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [mapZoom, setMapZoom] = useState(13);
  const [cameraNonce, setCameraNonce] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [clusterChoices,setClusterChoices]=useState<any[]>([]);
  const [fitRouteCamera,setFitRouteCamera]=useState(true);
  const [destinationCardOpen,setDestinationCardOpen]=useState(false);
  const [search, setSearch] = useState('');
  const [interpretedIntent,setInterpretedIntent]=useState<DiscoveryIntent|null>(null);
  const [searchAreaOrigin,setSearchAreaOrigin]=useState<[number,number]|null>(null);
  const [searchAreaLabel,setSearchAreaLabel]=useState('');
  const [pendingMapOrigin,setPendingMapOrigin]=useState<[number,number]|null>(null);
  const [radius, setRadius] = useState(1609);
  const [maxRadius, setMaxRadius] = useState(402336);
  const [effectiveRadiusMeters, setEffectiveRadiusMeters] = useState(1609);
  const [attemptedRadiiMeters, setAttemptedRadiiMeters] = useState<number[]>([]);
  const [autoExpand, setAutoExpand] = useState(true);
  const [matchRule, setMatchRule] = useState<AmenityMatchRule>('all');
  const [corridor, setCorridor] = useState(16093);
  const [amenities, setAmenities] = useState<AmenityCatalogItem[]>([]);
  const [selectedAmenityNames, setSelectedAmenityNames] = useState<string[]>([]);
  const [preferenceAmenityNames,setPreferenceAmenityNames]=useState<string[]>([]);
  const [kleenestOnly,setKleenestOnly]=useState(false);
  const [progressionOnly,setProgressionOnly]=useState(false);
  const [minimumStars,setMinimumStars]=useState(0);
  const [freshnessDays,setFreshnessDays]=useState<number|null>(null);
  const [verifiedEvidenceOnly,setVerifiedEvidenceOnly]=useState(false);
  const [evidenceGapOnly,setEvidenceGapOnly]=useState(false);
  const [progressionPriority,setProgressionPriority]=useState(false);
  const [rewardCapabilities,setRewardCapabilities]=useState<any>({});
  const [route, setRoute] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [organicInsight,setOrganicInsight]=useState('');
  const [checkInFeedback,setCheckInFeedback]=useState<Record<string,CheckInActionFeedback>>({});
  const [cached, setCached] = useState(false);
  const [mapInteracting,setMapInteracting]=useState(false);
  const [showSelectedMore,setShowSelectedMore]=useState(false);
  const [resultsSheetExpanded,setResultsSheetExpanded]=useState(false);
  function setMapGestureLock(locked:boolean){
    if(mapGestureReleaseRef.current){
      clearTimeout(mapGestureReleaseRef.current);
      mapGestureReleaseRef.current=null;
    }
    setMapInteracting(locked);
  }
  function beginMapGesture(){setMapGestureLock(true);}
  function endMapGesture(){
    if(mapGestureReleaseRef.current)clearTimeout(mapGestureReleaseRef.current);
    mapGestureReleaseRef.current=setTimeout(()=>{
      setMapInteracting(false);
      mapGestureReleaseRef.current=null;
    },180);
  }
  function applyDensityAwareCamera(cameraRows:any[],target:[number,number]){
    const densityZoom=densityAwareInitialZoom(cameraRows,target);
    setFitRouteCamera(false);
    setMapCenter(target);
    setMapZoom(densityZoom);
    cameraRef.current?.jumpTo({center:target,zoom:densityZoom});
    setCameraNonce((value)=>value+1);
  }
  useEffect(()=>()=>{if(mapGestureReleaseRef.current)clearTimeout(mapGestureReleaseRef.current);},[]);
  const searchedDestination=useMemo(()=>searchAreaOrigin?{
    id:'searched-destination',
    name:searchAreaLabel||'Searched destination',
    address:searchAreaLabel||'',
    longitude:searchAreaOrigin[0],
    latitude:searchAreaOrigin[1],
    geofence_radius_m:SEARCH_DESTINATION_GEOFENCE_RADIUS_M,
    ephemeral_destination:true,
  }:null,[searchAreaOrigin,searchAreaLabel]);
  const searchPanelTop=8;
  const floatingContextRows=(searchAreaLabel?1:0)+(interpretedIntent?.summary?1:0);
  const mapChromeTop=142+(floatingContextRows*38);

  const unlockedMapFilters=Array.isArray(rewardCapabilities?.unlocked_map_filters)?rewardCapabilities.unlocked_map_filters:[];
  const equippedMapFlair=String(rewardCapabilities?.equipped?.map_flair?.reward_key||'');
  const precisionFilterUnlocked=unlockedMapFilters.some((reward:any)=>String(reward?.reward_key||'')==='precision');
  const progressionFilterUnlocked=unlockedMapFilters.some((reward:any)=>String(reward?.reward_key||'')==='progression-opportunities');
  const evidenceGapRadar=Boolean(rewardCapabilities?.beta_features?.evidence_gap_radar);
  useEffect(()=>{
    if(!precisionFilterUnlocked){
      setVerifiedEvidenceOnly(false);
      if(!evidenceGapRadar)setEvidenceGapOnly(false);
    }
    if(!progressionFilterUnlocked)setProgressionPriority(false);
  },[precisionFilterUnlocked,progressionFilterUnlocked,evidenceGapRadar]);
  const visibleRows=useMemo(()=>{
    const filtered=rows.filter((row)=>{
      if(kleenestOnly&&!isKleenestPlace(row))return false;
      if(progressionOnly&&!row?.progression_opportunity)return false;
      if(minimumStars>0&&ratingOf(row)<minimumStars)return false;
      if(!isFreshWithinDays(row,freshnessDays))return false;
      if(verifiedEvidenceOnly&&!hasVerifiedEvidence(row))return false;
      if(evidenceGapOnly&&!hasEvidenceGap(row))return false;
      return true;
    });
    if(progressionPriority&&progressionFilterUnlocked)return [...filtered].sort((a,b)=>Number(Boolean(b?.progression_opportunity))-Number(Boolean(a?.progression_opportunity)));
    return filtered;
  },[rows,kleenestOnly,progressionOnly,minimumStars,freshnessDays,verifiedEvidenceOnly,evidenceGapOnly,progressionPriority,progressionFilterUnlocked]);
  const markerGroups=useMemo(()=>organizeMapMarkers(visibleRows,mapZoom),[visibleRows,mapZoom]);
  const freshNearbyCount=useMemo(()=>visibleRows.filter((row)=>isFreshWithinDays(row,7)).length,[visibleRows]);
  const kleenestNearbyCount=useMemo(()=>visibleRows.filter(isKleenestPlace).length,[visibleRows]);
  const activeFilterCount=(kleenestOnly?1:0)+(progressionOnly?1:0)+(minimumStars>0?1:0)+(freshnessDays?1:0)+(selectedAmenityNames.length?1:0)+(verifiedEvidenceOnly?1:0)+(evidenceGapOnly?1:0)+(progressionPriority?1:0);
  const filterSummary=useMemo(()=>{
    const parts:string[]=[];
    if(kleenestOnly)parts.push('Kleenest');
    if(progressionOnly)parts.push('Progression');
    if(minimumStars>0)parts.push(`${minimumStars}★+`);
    if(freshnessDays)parts.push(freshnessDays===1?'Fresh 24h':`Fresh ${freshnessDays}d`);
    if(verifiedEvidenceOnly)parts.push('Verified evidence');
    if(evidenceGapOnly)parts.push('Evidence gaps');
    if(progressionPriority)parts.push('Progression first');
    if(selectedAmenityNames.length)parts.push(`${selectedAmenityNames.length} amenity${selectedAmenityNames.length===1?'':'ies'}`);
    return parts.length?parts.join(' · '):'Everything';
  },[kleenestOnly,progressionOnly,minimumStars,freshnessDays,verifiedEvidenceOnly,evidenceGapOnly,progressionPriority,selectedAmenityNames.length]);

  useEffect(()=>{setShowSelectedMore(false);},[selectedId]);
  const selected = useMemo(
    () => visibleRows.find((row) => idOf(row) === selectedId) || null,
    [visibleRows, selectedId],
  );
  const selectedRoutePosition = useMemo(() => {
    if (!selected || mode !== 'route' || !route) return '';
    const fraction = Math.max(0, Math.min(1, Number(selected.route_fraction || 0)));
    const ahead = Math.max(0, Number(route.distanceMiles || 0) * fraction);
    const eta = Math.max(0, Number(route.durationMinutes || 0) * fraction);
    return `~${ahead.toFixed(ahead < 10 ? 1 : 0)} mi ahead · ~${Math.round(eta)} min · ${distanceLabel(selected.distance_to_route_meters)} off route`;
  }, [selected, mode, route]);
  const filterAmenities = useMemo(
    () => amenities.filter((item) => FILTER_CATEGORIES.has(String(item.category || ''))),
    [amenities],
  );
  useEffect(()=>{
    let active=true;
    if(!amenities.length){setPreferenceAmenityNames([]);return()=>{active=false};}
    getBathroomFitPreferences().then(preferences=>{
      if(!active)return;
      const wanted=BATHROOM_FIT_OPTIONS.filter(([key])=>Boolean(preferences?.[key])).map(([,label])=>String(label));
      const normalized=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
      const matched=wanted.flatMap(label=>{
        const target=normalized(label);
        const exact=amenities.find(item=>normalized(item.name)===target);
        if(exact)return[exact.name];
        const fuzzy=amenities.find(item=>normalized(item.name).includes(target)||target.includes(normalized(item.name)));
        return fuzzy?[fuzzy.name]:[];
      });
      setPreferenceAmenityNames(Array.from(new Set(matched)));
    }).catch(()=>{if(active)setPreferenceAmenityNames([])});
    return()=>{active=false};
  },[amenities]);
  const rankingAmenityNames=selectedAmenityNames.length?selectedAmenityNames:preferenceAmenityNames;
  useEffect(()=>{let active=true;setOrganicInsight('');if(!selected)return()=>{active=false};void organicExploreReason(selected,rankingAmenityNames,mode==='route'?route:null).then(answer=>{if(active)setOrganicInsight(answer)}).catch(()=>{});return()=>{active=false}},[selected,rankingAmenityNames,mode,route]);
  const routeBounds = useMemo(() => {
    if (!route?.geometry?.coordinates?.length || selected || destinationCardOpen) return null;
    const points = route.geometry.coordinates as [number, number][];
    let west = Math.min(...points.map((point) => point[0]));
    let east = Math.max(...points.map((point) => point[0]));
    let south = Math.min(...points.map((point) => point[1]));
    let north = Math.max(...points.map((point) => point[1]));
    if (west === east) { west -= 0.01; east += 0.01; }
    if (south === north) { south -= 0.01; north += 0.01; }
    return [west, south, east, north] as [number, number, number, number];
  }, [route, selectedId, destinationCardOpen]);
  const routeGap = useMemo(() => {
    if (!route || !visibleRows.length) return null;
    const fractions = [
      0,
      ...visibleRows
        .filter(hasRestroomSignal)
        .map((row) => Math.max(0, Math.min(1, Number(row.route_fraction || 0))))
        .sort((a, b) => a - b),
      1,
    ];
    let gap = 0;
    for (let index = 1; index < fractions.length; index += 1) {
      gap = Math.max(gap, fractions[index] - fractions[index - 1]);
    }
    return gap * Number(route.distanceMiles || 0);
  }, [route, visibleRows]);

  function toggleAmenity(name: string) {
    setSelectedAmenityNames((current) =>
      current.includes(name)
        ? current.filter((value) => value !== name)
      …20851 tokens truncated…r,{backgroundColor:theme.line}]} />
                <View style={s.resultsSheetHeadingRow}>
                  <View style={s.resultsSheetHeadingMain}>
                    <Text numberOfLines={1} style={[s.resultsSheetEyebrow,{color:theme.accent}]}>
                      {selected?'SELECTED PLACE':destinationCardOpen&&searchAreaOrigin?'DESTINATION':mode==='route'?'ALONG YOUR ROUTE':'NEARBY RESULTS'}
                    </Text>
                    <Text numberOfLines={1} style={[s.resultsSheetTitle,{color:theme.ink}]}>
                      {selected
                        ? discoveryPlaceName(selected)
                        : destinationCardOpen&&searchAreaOrigin
                          ? (searchAreaLabel||'Destination')
                          : mode==='route'
                            ? `Useful stops ahead · ${visibleRows.length}`
                            : `Useful places nearby · ${visibleRows.length}`}
                    </Text>
                  </View>
                  <Text style={[s.resultsSheetToggle,{color:theme.accent}]}>{resultsSheetExpanded?'Collapse ↓':'Expand ↑'}</Text>
                </View>
              </Pressable>

              {destinationCardOpen&&searchAreaOrigin&&!selected ? (
                <View style={s.selectedSheetBody}>
                  <Text numberOfLines={2} style={[s.selectedSheetAddress,{color:theme.muted}]}>{searchAreaLabel||'Destination'}</Text>
                  <Text numberOfLines={1} style={[s.destinationSummary,{color:theme.muted}]}>
                    {mode==='route'
                      ? (route?.distanceMiles?`${Number(route.distanceMiles).toFixed(0)} mi route · ~${Math.round(Number(route.durationMinutes||0))} min`:'Route destination')
                      : `Nearby places ready · ${radiusLabel(effectiveRadiusMeters)}`}
                  </Text>
                  <View style={s.selectedSheetActions}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Start directions to searched destination" style={[s.primarySmall,s.selectedSheetAction,{backgroundColor:theme.accent}]} onPress={()=>void goToSearchDestination()}>
                      <Text style={[s.primaryText,{color:theme.accentText}]}>Go →</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Search nearby this destination" style={[s.secondarySmall,s.selectedSheetAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={searchNearDestination}>
                      <Text style={[s.secondaryText,{color:theme.accent}]}>Nearby</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Use searched destination for route" style={[s.secondarySmall,s.selectedSheetAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={addSearchDestinationToRoute}>
                      <Text style={[s.secondaryText,{color:theme.accent}]}>Along route</Text>
                    </Pressable>
                  </View>
                </View>
              ) : selected ? (
                <View style={s.selectedSheetBody}>
                  <View style={s.selectedSheetSummary}>
                    <FreshnessHeatRing item={selected} size={38} photoUrl={selected.consumer_photo_url ? String(selected.consumer_photo_url) : undefined} />
                    <View style={s.resultsSheetHeadingMain}>
                      <Text numberOfLines={1} style={[s.selectedSheetAddress,{color:theme.muted}]}>
                        {[selected.address,selected.city,selected.state].filter(Boolean).join(', ')||'Address unavailable'}
                      </Text>
                      <Text numberOfLines={1} style={[s.selectedDecisionMeta,{color:theme.muted}]}>
                        {[selected.discovery_recommended?recommendationReason(selected,rankingAmenityNames):null,selectedRoutePosition||distanceLabel(selected.distance_meters)].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel="Close selected location" hitSlop={12} onPress={()=>setSelectedId('')} style={[s.sheetClose,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
                      <Text style={[s.sheetCloseText,{color:theme.accent}]}>×</Text>
                    </Pressable>
                  </View>
                  <DecisionRestroomSignals item={selected} />
                  <View style={s.selectedSheetActions}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Start directions to this location" accessibilityHint="Start navigation" style={[s.primarySmall,s.selectedSheetAction,{backgroundColor:theme.accent},!hasCoordinates(selected)&&s.disabled]} disabled={!hasCoordinates(selected)} onPress={()=>void directions(selected)}>
                      <Text style={[s.primaryText,{color:theme.accentText}]}>Go →</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Add selected location to route" style={[s.secondarySmall,s.selectedSheetAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={()=>addToRoute(selected)}>
                      <Text style={[s.secondaryText,{color:theme.accent}]}>Add to route</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Open full selected location details" style={[s.secondarySmall,s.selectedSheetAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={()=>openLocationDetails(selected)}>
                      <Text style={[s.secondaryText,{color:theme.accent}]}>Full details</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Save selected restroom for next time" style={[s.secondarySmall,s.selectedSheetAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={()=>void saveForLater(selected)}>
                      <Text style={[s.secondaryText,{color:theme.accent}]}>♡ Save</Text>
                    </Pressable>
                  </View>
                  {resultsSheetExpanded?(
                    <ScrollView style={s.selectedSheetScroll} contentContainerStyle={s.selectedSheetScrollContent} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                      {organicInsight?<Text style={[s.sheetInsight,{color:theme.ink}]}>{organicInsight}</Text>:null}
                      <RequestedAmenityMatches item={selected} requested={rankingAmenityNames} />
                      <Text style={[s.trustLine,{color:theme.ink}]}>{trustSummaryLine(selected)}</Text>
                      <View style={s.selectedMoreRow}>
                        <Pressable accessibilityRole="button" accessibilityLabel={selected.active_check_in?'Already checked in at selected location':checkInFeedback[idOf(selected)]?.status==='checking'?'Checking your location':selected.visit_verification_available?'Verify your detected visit at selected location':'Verify that I am at selected location'} accessibilityHint="Check in" accessibilityState={{disabled:Boolean(selected.active_check_in)||checkInFeedback[idOf(selected)]?.status==='checking',busy:checkInFeedback[idOf(selected)]?.status==='checking'}} disabled={Boolean(selected.active_check_in)||checkInFeedback[idOf(selected)]?.status==='checking'} style={[s.selectedMoreAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line},(selected.active_check_in||checkInFeedback[idOf(selected)]?.status==='checking')&&s.disabled]} onPress={()=>void checkIn(selected)}>
                          <Text style={[s.selectedMoreText,{color:theme.accent}]}>{selected.active_check_in?'Checked in ✓':checkInFeedback[idOf(selected)]?.status==='checking'?'Checking…':selected.visit_verification_available?'Verify visit':"I'm here"}</Text>
                        </Pressable>
                        <Pressable accessibilityRole="button" accessibilityLabel="Share what I know about selected location" style={[s.selectedMoreAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={()=>contributeKnowledge(selected)}>
                          <Text style={[s.selectedMoreText,{color:theme.accent}]}>I know this place</Text>
                        </Pressable>
                      </View>
                      <CheckInStatus feedback={checkInFeedback[idOf(selected)]} onReview={()=>router.push({pathname:'/location/[id]',params:{id:idOf(selected),review:'1'}})} />
                    </ScrollView>
                  ):null}
                </View>
              ) : (
                <View style={s.resultsSheetBody}>
                  {(message||cached)?(
                    <View style={s.sheetStatusRow}>
                      <Text numberOfLines={2} accessibilityLiveRegion="polite" style={[s.sheetStatusText,{color:theme.muted}]}>{message||'Showing cached nearby places.'}</Text>
                      {!loading?<Pressable accessibilityRole="button" accessibilityLabel="Refresh live nearby results" onPress={()=>void load({preserveCacheOnEmpty:true,recenterOnLiveLocation:mode==='nearby'&&!searchAreaOrigin})}><Text style={[s.sheetRefresh,{color:theme.accent}]}>Refresh</Text></Pressable>:null}
                    </View>
                  ):null}
                  <ScrollView style={s.resultsSheetList} contentContainerStyle={s.resultsSheetListContent} showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {visibleRows.length?visibleRows.map((item,index)=>(
                      <View key={idOf(item)||String(index)}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Select ${discoveryPlaceName(item)}`}
                          onPress={()=>selectRow(item)}
                          style={[s.sheetResultRow,{borderColor:theme.line,backgroundColor:idOf(item)===selectedId?theme.accentSoft:theme.surface}]}
                        >
                          <FreshnessHeatRing item={item} size={30} photoUrl={item.consumer_photo_url?String(item.consumer_photo_url):undefined} />
                          <View style={s.sheetResultMain}>
                            <View style={s.sheetResultTitleRow}>
                              <Text numberOfLines={1} style={[s.sheetResultTitle,{color:theme.ink}]}>{discoveryPlaceName(item)}</Text>
                              <Text numberOfLines={1} style={[s.sheetResultDistance,{color:theme.accent}]}>{mode==='route'&&Number.isFinite(Number(item.distance_to_route_meters))?distanceLabel(item.distance_to_route_meters):distanceLabel(item.distance_meters)}</Text>
                            </View>
                            <Text numberOfLines={1} style={[s.sheetResultMeta,{color:theme.muted}]}>{[item.address,item.city,item.state].filter(Boolean).join(', ')||discoveryListingReference(item)}</Text>
                            <CompactRestroomSignals item={item} />
                            <RequestedAmenityMatches item={item} requested={selectedAmenityNames} compact />
                          </View>
                          <Pressable accessibilityRole="button" accessibilityLabel={'View Kleenest QR for '+String(discoveryPlaceName(item))} onPress={(event)=>{event.stopPropagation();openLocationQr(item);}} style={{paddingHorizontal:6,paddingVertical:6,backgroundColor:theme.accentSoft,borderRadius:10}}>
                            <Text style={{color:theme.accent,fontSize:11,fontWeight:'900'}}>▦ QR</Text>
                          </Pressable>
                          <Text style={[s.sheetResultChevron,{color:theme.accent}]}>›</Text>
                        </Pressable>
                        {index===3?<AdMobNativeSlot contextClass="maps_network_after_results_4" keywords={[mode,...selectedAmenityNames,'restroom','local travel']}/>:null}
                        {index===13?<AdMobNativeSlot contextClass="maps_network_after_results_14" keywords={[mode,...selectedAmenityNames,'restroom','local travel']}/>:null}
                        {index===Math.min(1,visibleRows.length-1)?<GuestInstallUpsell/>:null}
                      </View>
                    )):(
                      <View style={[s.sheetEmpty,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
                        <Text style={[s.emptyTitle,{color:theme.ink}]}>No qualifying results yet.</Text>
                        <Text style={[s.help,{color:theme.muted}]}>{mode==='nearby'?(activeFilterCount?'Your filters are hiding the broader nearby network.':'Search an address, move the map, or refresh live discovery.'):'Enter a destination, widen the route corridor, or adjust amenities.'}</Text>
                        {mode==='nearby'&&activeFilterCount?<Pressable accessibilityRole="button" style={[s.emptyPrimary,{backgroundColor:theme.accent}]} onPress={()=>{resetFilters();setTimeout(()=>void load(),0)}}><Text style={[s.primaryText,{color:theme.accentText}]}>Show everything nearby</Text></Pressable>:null}
                      </View>
                    )}
                            {mode==='route'&&routeGap!=null?(
                      <View style={[s.sheetRouteCoverage,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
                        <Text style={[s.routeCoverageTitle,{color:theme.ink}]}>Longest stretch between qualifying bathrooms: ~{routeGap.toFixed(routeGap<10?1:0)} mi</Text>
                      </View>
                    ):null}
                    <SponsoredSlot surface="maps" context={{route_context:mode,amenities:selectedAmenityNames}} contextClass="maps_between_results" compact/>
                    {resultsSheetExpanded?<Pressable accessibilityRole="button" accessibilityLabel="Add a missing bathroom" onPress={()=>router.push('/discover')} style={[s.sheetMissingPlace,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
                      <Text style={[s.listEyebrow,{color:theme.accent}]}>MISSING A PLACE?</Text>
                      <Text style={[s.missingTitle,{color:theme.ink}]}>Add a missing bathroom</Text>
                    </Pressable>:null}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
          {false&&visibleRows.length?(
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show ${visibleRows.length} ${mode==='route'?'along-route':'nearby'} result${visibleRows.length===1?'':'s'}`}
              accessibilityHint="Jump to the first search result"
              onPress={()=>listRef.current?.scrollToIndex({index:0,animated:true,viewPosition:0})}
              style={[s.resultsHandoff,{backgroundColor:theme.surface,borderColor:theme.line}]}
            >
              <Text numberOfLines={1} style={[s.resultsHandoffText,{color:theme.ink}]}>
                {mode==='route'? `Stops along route · ${radiusLabel(corridor)} corridor` : `Nearby places · ${radiusLabel(effectiveRadiusMeters)}`}
              </Text>
              <Text style={[s.resultsHandoffAction,{color:theme.accent}]}>Results ↓</Text>
            </Pressable>
          ):null}
          {mode === 'route' && routeGap != null ? (
            <View style={[s.routeCoverage,{backgroundColor:theme.surface,borderColor:theme.line}]}>
              <Text numberOfLines={1} style={[s.routeCoverageTitle,{color:theme.ink}]}>Longest stretch between qualifying bathrooms: ~{routeGap.toFixed(routeGap < 10 ? 1 : 0)} mi</Text>
            </View>
          ) : null}
        </View>
      ) : null}

            {(message || (mode === 'nearby' && attemptedRadiiMeters.length > 1) || cached) ? (
              <View style={s.discoveryStatus}>
                {message ? <Text numberOfLines={3} accessibilityLiveRegion="polite" style={[s.message,{color:theme.muted}]}>{message}</Text> : null}
                {mode === 'nearby' && attemptedRadiiMeters.length > 1 ? (
                  <Text style={[s.provenance,{color:theme.muted}]}>
                    Searched farther to {radiusLabel(effectiveRadiusMeters)} to find useful matches.
                  </Text>
                ) : null}
                {cached ? <Text style={[s.provenance,{color:theme.muted}]}>Offline continuity result — refresh for live qualification.</Text> : null}
                {!loading ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Refresh live nearby results"
                    accessibilityHint="Retries live discovery without discarding cached results"
                    onPress={()=>void load({
                      preserveCacheOnEmpty:true,
                      recenterOnLiveLocation:mode==='nearby'&&!searchAreaOrigin,
                    })}
                  >
                    <Text style={[s.searchAreaAction,{color:theme.accent}]}>Refresh live</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View style={s.listHeading}>
              <View style={s.listHeadingMain}>
                <Text style={[s.listEyebrow,{color:theme.accent}]}>{mode === 'route' ? 'ALONG YOUR ROUTE' : 'NEARBY OPTIONS'}</Text>
                <Text style={[s.listTitle,{color:theme.ink}]}>{mode === 'route' ? 'Useful stops ahead' : 'Useful places nearby'}</Text>
              </View>
              <Text numberOfLines={1} style={[s.listNote,{color:theme.muted}]}>{activeFilterCount?filterSummary:(cached ? 'Cached' : mode==='route'? `${radiusLabel(corridor)} corridor` : 'Distance + actions')}</Text>
            </View>
          </View>
        }
        renderItem={() => null}
        ListEmptyComponent={!loading ? (
          <View style={[s.resultItem,{backgroundColor:theme.surface,borderColor:theme.line}]}>
            <View style={[s.empty,{backgroundColor:theme.surface,borderColor:theme.line}]}>
              <Text style={[s.emptyTitle,{color:theme.ink}]}>No qualifying results yet.</Text>
              <Text style={[s.help,{color:theme.muted}]}>
                {mode === 'nearby'
                  ? (activeFilterCount?'Your filters are hiding the broader nearby network.':'Kleenest does not have a strong nearby match yet. You can expand the search or add what is missing.')
                  : 'Build or adjust your saved route, widen its corridor, or change amenity requirements.'}
              </Text>
              <View style={s.emptyActions}>
                {mode==='nearby'&&activeFilterCount?<Pressable accessibilityRole="button" style={[s.emptyPrimary,{backgroundColor:theme.accent}]} onPress={()=>{resetFilters();setTimeout(()=>void load(),0)}}><Text style={[s.primaryText,{color:theme.accentText}]}>Show everything nearby</Text></Pressable>:null}
                <Pressable accessibilityRole="button" accessibilityLabel="Add a missing bathroom" style={[s.emptySecondary,{backgroundColor:theme.accentSoft,borderColor:theme.line}]} onPress={()=>router.push('/discover')}><Text style={[s.secondaryText,{color:theme.accent}]}>Add a missing bathroom</Text></Pressable>
              </View>
            </View>
          </View>
        ) : null}
        ListFooterComponent={
          <View style={s.listFooter}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a missing bathroom"
              onPress={() => router.push('/discover')}
              style={[s.missingPlace,{backgroundColor:theme.surface,borderColor:theme.line}]}
            >
              <Text style={[s.listEyebrow,{color:theme.accent}]}>MISSING A PLACE?</Text>
              <Text style={[s.missingTitle,{color:theme.ink}]}>Add a missing bathroom</Text>
              <Text style={[s.help,{color:theme.muted}]}>Name + address is enough to start. Add stronger evidence now or later and earn progression when it qualifies.</Text>
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, minWidth: 0, width: '100%', maxWidth: '100%', backgroundColor: palette.canvas },
  pageScroll: { flex: 1, minWidth: 0, width: '100%', maxWidth: '100%' },
  exploreCanvas:{position:'relative',minWidth:0,width:'100%',maxWidth:'100%'},
  exploreStage:{position:'relative',minWidth:0,width:'100%',maxWidth:'100%',overflow:'hidden'},
  hero: {
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: palette.green,
  },
  heroTop: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  eyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 1.5, color: '#bed4c6' },
  title: { fontSize: 17, lineHeight: 20, fontWeight: '900', color: '#fff', marginTop: 1 },
  heroBody: { fontSize: 10, lineHeight: 15, color: '#dfeae3', marginTop: 3 },
  locate: {
    minHeight: 40,
    minWidth: 62,
    borderRadius: 13,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  locateIcon: { fontSize: 16, fontWeight: '900', color: palette.green },
  locateText: { fontSize: 8, fontWeight: '900', color: palette.green },
  floatingSearchPanel:{position:'absolute',top:0,left:8,right:8,zIndex:80,elevation:24,minWidth:0,maxWidth:'100%',paddingHorizontal:7,paddingTop:7,paddingBottom:6,gap:4,borderRadius:14,borderWidth:1},
  searchAreaChip:{minWidth:0,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,backgroundColor:'#e8f1eb',borderRadius:11,paddingHorizontal:10,paddingVertical:7},
  searchAreaText:{flex:1,minWidth:0,fontSize:13,lineHeight:18,fontWeight:'900',color:palette.green},searchAreaAction:{flexShrink:0,fontSize:12,fontWeight:'900',color:palette.green,textDecorationLine:'underline'},
  segment: { minWidth: 0, width: '100%', flexDirection: 'row', padding: 2, borderRadius: 10, backgroundColor: '#e8efea' },
  segmentButton: { flex: 1, minHeight: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: palette.green },
  segmentText: { fontSize: 12, fontWeight: '900', color: palette.green },
  segmentTextActive: { color: '#fff' },
  searchRow: { minWidth: 0, width: '100%', flexDirection: 'row', gap: 7 },
  input: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#d6e2da',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    fontSize: 14,
    color: palette.ink,
  },
  searchButton: { flexShrink: 0, minHeight: 42, borderRadius: 10, backgroundColor: palette.green, paddingHorizontal: 12, justifyContent: 'center' },
  searchButtonText: { fontSize: 12, fontWeight: '900', color: '#fff' },
  rowHeading: { flexWrap: 'wrap', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  autoRow: { maxWidth: '100%', flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  autoLabel: { flexShrink: 1, fontSize: 9, fontWeight: '800', color: '#5f7468' },
  filterTitle: { flexShrink: 1, fontSize: 10, fontWeight: '900', color: palette.green },
  inlineBlock: { gap: 5 },
  choiceRow: { flexDirection: 'row', gap: 6, paddingRight: 8 },
  choice: { minHeight: 32, paddingHorizontal: 9, borderRadius: 999, backgroundColor: '#e8efea', justifyContent: 'center' },
  choiceActive: { backgroundColor: palette.green },
  choiceText: { fontSize: 9, fontWeight: '900', color: '#52675a' },
  choiceTextActive: { color: '#fff' },
  linkText: { fontSize: 9, fontWeight: '900', color: palette.green, textDecorationLine: 'underline' },
  amenityHeading: { flexWrap: 'wrap', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  amenityTitle: { fontSize: 10, fontWeight: '900', color: palette.green },
  clear: { fontSize: 9, fontWeight: '900', color: '#567060' },
  amenityRow: { gap: 6, paddingRight: 8 },
  amenityPill: { maxWidth: '100%', flexShrink: 1, paddingVertical: 6, minHeight: 32, paddingHorizontal: 9, borderRadius: 999, backgroundColor: '#eef3ef', justifyContent: 'center' },
  amenityPillActive: { backgroundColor: palette.green },
  amenityText: { flexShrink: 1, fontSize: 9, fontWeight: '800', color: '#52675a' },
  amenityTextActive: { color: '#fff' },
  ruleRow: { flexDirection: 'row', gap: 6 },
  rule: { minHeight: 36, borderRadius: 10, backgroundColor: '#e8efea', paddingHorizontal: 10, justifyContent: 'center' },
  ruleActive: { backgroundColor: palette.green },
  ruleText: { fontSize: 9, fontWeight: '900', color: palette.green },
  ruleTextActive: { color: '#fff' },
  disabled: { opacity: 0.45 },
  message: { fontSize: 9, lineHeight: 14, color: '#66776d', fontWeight: '700' },
  provenance: { fontSize: 8, lineHeight: 12, color: '#718077', fontWeight: '700' },
  discoveryStatus:{display:'none',paddingHorizontal:12,paddingVertical:8,gap:4},
  help: { fontSize: 10, lineHeight: 15, color: '#5f7468' },
  mapSection:{minWidth:0,width:'100%',maxWidth:'100%',paddingHorizontal:0,gap:0,position:'relative',marginTop:0,overflow:'hidden'},
  initialMapPrompt:{position:'absolute',top:156,left:18,right:18,zIndex:20,elevation:8,alignItems:'flex-start',gap:8,padding:16,borderWidth:1,borderRadius:16,shadowColor:'#000',shadowOpacity:.08,shadowRadius:12,shadowOffset:{width:0,height:4}},
  initialMapPromptTitle:{fontSize:16,lineHeight:20,fontWeight:'900'},
  initialMapPromptBody:{fontSize:13,lineHeight:19,fontWeight:'600'},
  initialMapPromptButton:{minHeight:40,borderRadius:10,paddingHorizontal:14,justifyContent:'center',marginTop:2},
  mapFrame: {
    minWidth: 0,
    width: '100%',
    maxWidth: '100%',
    minHeight: 360,
    borderRadius: 0,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: '#d4e0d8',
    backgroundColor: '#dde6e0',
    position: 'relative',
  },
  mapGestureSurface:{flex:1},
  map: { flex: 1 },
  userLocationRing: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(32,106,69,.2)', alignItems: 'center', justifyContent: 'center' },
  userLocationDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.green, borderWidth: 2, borderColor: '#fff' },
  searchedAreaMarker:{width:30,height:30,borderRadius:15,backgroundColor:'#fff',borderWidth:3,borderColor:'#986c20',alignItems:'center',justifyContent:'center'},searchedAreaMarkerText:{fontSize:18,fontWeight:'900',color:'#986c20'},
  marker: { minWidth: 44, minHeight: 44, borderRadius: 22, backgroundColor: 'transparent', borderWidth: 0, alignItems: 'center', justifyContent: 'center', padding: 2, position:'relative' },
  markerActive: { transform: [{ scale: 1.08 }] },
  mapFlairBadge:{position:'absolute',top:-1,right:-1,width:14,height:14,borderRadius:7,borderWidth:1,alignItems:'center',justifyContent:'center',zIndex:2,elevation:10},
  mapFlairBadgeText:{fontSize:8,lineHeight:10,fontWeight:'900'},
  clusterMarker:{minWidth:42,height:42,borderRadius:21,borderWidth:2,alignItems:'center',justifyContent:'center',paddingHorizontal:6,elevation:8},
  clusterMarkerCount:{fontSize:13,fontWeight:'900',letterSpacing:-.4},
  markerPhoto:{width:34,height:34,borderRadius:17,backgroundColor:'#e7eee9'},
  markerPhotoActive:{width:42,height:42,borderRadius:21},
  mapControls: { position: 'absolute', right: 10, zIndex:54, elevation:18, gap: 6 },
  mapControl: { width: 44, height: 44, borderRadius: 13, backgroundColor: 'rgba(255,255,255,.97)', borderWidth: 1, borderColor: '#cbd9d0', alignItems: 'center', justifyContent: 'center' },
  mapControlText: { fontSize: 19, fontWeight: '900', color: palette.green },
  searchThisArea:{position:'absolute',left:92,right:58,zIndex:52,elevation:16,minHeight:38,borderRadius:999,borderWidth:1,alignItems:'center',justifyContent:'center',paddingHorizontal:12},
  searchThisAreaText:{fontSize:10,fontWeight:'900'},
  legendWrap: { position: 'absolute', left: 10, right: 56, zIndex:48 },
  resultsSheet:{position:'absolute',left:8,right:8,bottom:8,zIndex:72,elevation:24,minWidth:0,maxWidth:'100%',borderWidth:1,borderRadius:18,overflow:'hidden',shadowColor:'#000',shadowOpacity:.16,shadowRadius:14,shadowOffset:{width:0,height:5}},
  resultsSheetHandle:{paddingHorizontal:12,paddingTop:5,paddingBottom:6,gap:3},
  resultsSheetHandleBar:{width:40,height:4,borderRadius:999,alignSelf:'center'},
  resultsSheetHeadingRow:{minWidth:0,width:'100%',maxWidth:'100%',flexDirection:'row',alignItems:'center',gap:10},
  resultsSheetHeadingMain:{flex:1,minWidth:0},
  resultsSheetEyebrow:{fontSize:7,fontWeight:'900',letterSpacing:.9},
  resultsSheetTitle:{fontSize:14,lineHeight:18,fontWeight:'900'},
  resultsSheetToggle:{fontSize:10,fontWeight:'900'},
  resultsSheetBody:{flex:1,minHeight:0},
  resultsSheetList:{flex:1},
  resultsSheetListContent:{paddingHorizontal:8,paddingBottom:12,gap:5},
  sheetStatusRow:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,paddingBottom:7},
  sheetStatusText:{flex:1,fontSize:10,lineHeight:14,fontWeight:'700'},
  sheetRefresh:{fontSize:10,fontWeight:'900',textDecorationLine:'underline'},
  sheetResultRow:{minHeight:62,borderWidth:1,borderRadius:12,paddingHorizontal:7,paddingVertical:6,flexDirection:'row',alignItems:'center',gap:7},
  sheetResultMain:{flex:1,minWidth:0,gap:1},
  sheetResultTitleRow:{flexDirection:'row',alignItems:'center',gap:6},
  sheetResultTitle:{flex:1,fontSize:13,lineHeight:17,fontWeight:'900'},
  sheetResultDistance:{maxWidth:'32%',fontSize:9,fontWeight:'900'},
  sheetResultMeta:{fontSize:9,lineHeight:12,fontWeight:'700'},
  sheetResultChevron:{fontSize:22,lineHeight:24,fontWeight:'700'},
  sheetEmpty:{borderWidth:1,borderRadius:14,padding:12,gap:6},
  sheetMissingPlace:{borderWidth:1,borderRadius:14,padding:11,gap:2},
  sheetRouteCoverage:{borderWidth:1,borderRadius:12,paddingHorizontal:10,paddingVertical:7},
  selectedSheetBody:{flex:1,minHeight:0,paddingHorizontal:10,paddingBottom:10,gap:6},
  selectedSheetSummary:{minWidth:0,width:'100%',maxWidth:'100%',flexDirection:'row',alignItems:'center',gap:8,flexShrink:0},
  selectedSheetAddress:{fontSize:11,lineHeight:15,fontWeight:'800'},
  selectedSheetActions:{flexDirection:'row',gap:6,flexShrink:0,minHeight:44,minWidth:0,width:'100%',maxWidth:'100%'},
  selectedSheetAction:{flex:1,alignItems:'center',minWidth:0},
  selectedSheetScroll:{flex:1,minHeight:0},
  selectedSheetScrollContent:{gap:7,paddingBottom:14},
  sheetInsight:{fontSize:11,lineHeight:16,fontWeight:'800'},
  sheetClose:{width:36,height:36,borderRadius:18,borderWidth:1,alignItems:'center',justifyContent:'center'},
  sheetCloseText:{fontSize:22,lineHeight:24,fontWeight:'900'},
  resultsHandoff:{display:'none',minHeight:48,borderTopWidth:1,borderBottomWidth:1,paddingHorizontal:14,paddingVertical:7,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  resultsHandoffText:{flex:1,fontSize:13,fontWeight:'900'},
  resultsHandoffAction:{fontSize:13,fontWeight:'900'},
  legacySelectedPanel: { position: 'absolute', left: 9, right: 54, bottom: 9, height: 228, zIndex: 40, elevation: 12, borderRadius: 16, padding: 9, backgroundColor: 'rgba(255,255,255,.97)', borderWidth: 1, borderColor: '#cfe0d5', gap: 4, overflow:'hidden' },
  destinationPanel:{height:146,justifyContent:'flex-start'},
  destinationSummary:{fontSize:12,lineHeight:16,fontWeight:'800'},
  destinationAction:{flex:1,alignItems:'center',minWidth:78},
  selectedBodyScroll:{flex:1},
  selectedBodyContent:{gap:4,paddingBottom:0},
  selectedHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  selectedLabel: { flex: 1, fontSize: 8, fontWeight: '900', letterSpacing: 0.8, color: palette.green },
  close: { minWidth: 44, minHeight: 44, zIndex: 41, elevation: 13, borderRadius: 22, backgroundColor: palette.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 8 },
  closeText: { color: '#fff', fontSize: 20, lineHeight: 22, fontWeight: '900' },
  closeLabel: { color: '#fff', fontSize: 9, fontWeight: '900' },
  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  selectedPhoto:{width:48,height:48,borderRadius:12,backgroundColor:'#e7eee9'},
  selectedTitle: { fontSize: 17, lineHeight:22, fontWeight: '900', color: palette.ink },
  selectedDecisionMeta:{fontSize:11,lineHeight:15,fontWeight:'900'},
  actionRow: { flexDirection: 'row', gap: 6 },
  selectedAction: { flex: 1, alignItems: 'center' },
  selectedMoreRow:{flexDirection:'row',gap:6},
  selectedMoreAction:{flex:1,minHeight:44,borderWidth:1,borderRadius:9,alignItems:'center',justifyContent:'center',paddingHorizontal:8},
  selectedMoreText:{fontSize:11,fontWeight:'900'},
  primarySmall: { minHeight: 44, borderRadius: 9, backgroundColor: palette.green, paddingHorizontal: 9, paddingVertical: 6, justifyContent: 'center' },
  secondarySmall: { minHeight: 44, borderRadius: 9, backgroundColor: '#e8efea', paddingHorizontal: 9, paddingVertical: 6, justifyContent: 'center' },
  primaryText: { fontSize: 12, fontWeight: '900', color: '#fff' },
  secondaryText: { fontSize: 12, fontWeight: '900', color: palette.green },
  filterLauncher:{minHeight:38,borderRadius:10,borderWidth:1,borderColor:'#cbd9d0',backgroundColor:'#fff',paddingHorizontal:9,paddingVertical:4,flexDirection:'row',alignItems:'center',gap:7},
  filterLauncherMain:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:6},
  filterLauncherKicker:{fontSize:7,fontWeight:'900',letterSpacing:.8,color:palette.green},
  filterLauncherTitle:{flex:1,fontSize:12,fontWeight:'900',color:palette.ink},
  filterLauncherBadge:{maxWidth:'38%',backgroundColor:'#e8f1eb',borderRadius:999,paddingHorizontal:8,paddingVertical:4},
  filterLauncherBadgeText:{fontSize:9,fontWeight:'900',color:palette.green},
  filterSection:{gap:8,paddingBottom:12,borderBottomWidth:1,borderBottomColor:'#edf1ee'},
  filterSectionTitle:{fontSize:12,fontWeight:'900',color:palette.ink},
  quickFilterGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},
  quickFilterCard:{flexGrow:1,flexBasis:'47%',minHeight:76,borderRadius:14,borderWidth:1,borderColor:'#d4e0d8',backgroundColor:'#f7faf8',padding:11,gap:3},
  quickFilterCardActive:{backgroundColor:palette.green,borderColor:palette.green},
  quickFilterTitle:{fontSize:12,fontWeight:'900',color:palette.ink},
  quickFilterBody:{fontSize:9,lineHeight:13,fontWeight:'700',color:'#607268'},
  quickFilterTextActive:{color:'#fff'},
  amenityWrap:{flexDirection:'row',flexWrap:'wrap',gap:6},
  advancedButton: { minHeight: 34, borderRadius: 11, borderWidth: 1, borderColor: '#d6e2da', backgroundColor: '#f7faf8', paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(13,31,22,.46)', justifyContent: 'center', padding: 18 },
  advancedModalCard: { maxHeight: '90%', flexShrink: 1, overflow: 'hidden', borderRadius: 20, backgroundColor: '#fff', padding: 14, gap: 12 },
  advancedModalHeader: { flexShrink: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  advancedModalTitle: { fontSize: 18, lineHeight: 22, fontWeight: '900', color: palette.ink },
  advancedModalScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  advancedModalContent: { gap: 12, paddingBottom: 4 },
  modalClose: { flexShrink: 0, width: 38, height: 38, borderRadius: 19, backgroundColor: palette.green, alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { color: '#fff', fontSize: 22, lineHeight: 24, fontWeight: '900' },
  modalDone: { flexShrink: 0, paddingVertical: 12, minHeight: 40, borderRadius: 11, backgroundColor: palette.green, alignItems: 'center', justifyContent: 'center' },
  routeCoverage: { display:'none', paddingHorizontal: 14, paddingVertical: 5, borderBottomWidth: 1, borderColor: '#ead9b4' },
  routeCoverageTitle: { fontSize: 9, fontWeight: '800', color: palette.ink },
  list: { paddingHorizontal: 14, paddingBottom: 34, gap: 8 },
  listHeading: { display:'none', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 8 },
  listHeadingMain:{flex:1,minWidth:0},
  resultItem: { display:'none', paddingHorizontal: 14, paddingBottom: 8 },
  listFooter: { display:'none', paddingHorizontal: 14, paddingBottom: 34 },
  listEyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8, color: palette.green },
  listTitle: { fontSize: 19, lineHeight:24, fontWeight: '900', color: palette.ink },
  listNote: { maxWidth:'34%', fontSize: 8, fontWeight: '800', color: '#718077', textAlign:'right' },
  card: { borderRadius: 16, padding: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce6df', gap: 5 },
  cardActive: { borderColor: palette.green, borderWidth: 2 },
  cardMain: { gap: 4 },
  cardActionRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  cardAction: { flexGrow: 1, alignItems: 'center' },
  checkInStatus:{borderWidth:1,borderRadius:10,paddingHorizontal:9,paddingVertical:7,marginTop:2,gap:6},
  checkInStatusText:{fontSize:9,lineHeight:13,fontWeight:'900'},
  checkInStatusMeta:{fontSize:8,lineHeight:12,fontWeight:'700'},
  checkInReviewAction:{minHeight:36,borderRadius:9,paddingHorizontal:10,paddingVertical:8,alignItems:'center',justifyContent:'center'},
  checkInReviewText:{fontSize:9,fontWeight:'900'},
  amenityMatchRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 2 },
  amenityMatchLabel: { fontSize: 7, fontWeight: '900', letterSpacing: 0.8, color: palette.green },
  amenityMatchPill: { borderRadius: 999, backgroundColor: '#e8f1eb', paddingHorizontal: 7, paddingVertical: 4 },
  amenityMatchText: { fontSize: 8, fontWeight: '900', color: palette.green },
  cardTop: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  cardPhoto:{width:68,height:68,borderRadius:14,backgroundColor:'#e7eee9'},
  cardTitleRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:6},
  cardTitle: { fontSize: 17, lineHeight:22, fontWeight: '900', color: palette.ink, flexShrink:1 },
  recommendedBadge:{borderWidth:1,borderRadius:999,paddingHorizontal:7,paddingVertical:3},
  recommendedBadgeText:{fontSize:7,fontWeight:'900',letterSpacing:0.7},
  recommendedReason:{fontSize:8,lineHeight:12,fontWeight:'800'},
  meta: { fontSize: 11, lineHeight: 16, color: '#66776d' },
  distance: { fontSize: 11, fontWeight: '900', color: palette.green },
  routeLine: { fontSize: 10, fontWeight: '900', color: '#365445' },
  trustSummaryRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  trustLine: { flex:1,fontSize: 11, lineHeight: 16, color: '#52675b', fontWeight: '700' },
  trustWhy:{fontSize:11,fontWeight:'900',textDecorationLine:'underline'},
  trustEvidenceBox:{borderWidth:1,borderRadius:10,paddingHorizontal:9,paddingVertical:7,gap:3},
  trustEvidenceText:{fontSize:9,lineHeight:13,fontWeight:'700'},
  networkCallout:{borderWidth:1,borderRadius:12,padding:10,gap:3,marginTop:7},
  networkKicker:{fontSize:8,fontWeight:'900',letterSpacing:1},
  networkBody:{fontSize:11,lineHeight:16,fontWeight:'900'},
  networkMeta:{fontSize:10,lineHeight:15,fontWeight:'700'},
  networkSelectedLine:{fontSize:9,lineHeight:13,fontWeight:'900'},
  emptyActions:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:6},
  emptyPrimary:{minHeight:36,borderRadius:10,paddingHorizontal:11,justifyContent:'center'},
  emptySecondary:{minHeight:36,borderRadius:10,borderWidth:1,paddingHorizontal:11,justifyContent:'center'},
  missingPlace: { marginTop: 4, marginBottom: 12, borderRadius: 14, padding: 12, backgroundColor: '#eef4f0', borderWidth: 1, borderColor: '#d4e0d8' },
  missingTitle: { fontSize: 14, fontWeight: '900', color: palette.ink, marginTop: 2 },
  empty: { borderRadius: 16, padding: 14, backgroundColor: '#fff', gap: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '900', color: palette.ink },
});
