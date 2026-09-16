import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import {
  buildMobileRoute,
  findAdaptiveNearbyRestrooms,
  listNearbyRestrooms,
  listRestroomsAlongRoute,
  mobileCheckIn,
  type AmenityMatchRule,
} from '@kleenest/mobile-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { listAmenityCatalog, type AmenityCatalogItem } from '../services/amenities';
import { visitFreshness } from '../services/evidenceFormatting';
import { attachLocationNetwork, attachLocationTrust, listLocationNetworkStatuses, listLocationTrustSummaries, networkEvidenceSummary } from '../services/locationTrust';
import { useConsumerTheme } from '../services/theme';
import { resolveConsumerSearchLocation } from '../services/locationResolver';
import {
  cachedAgeLabel,
  readNearbyCache,
  readNearbyContinuity,
  writeNearbyCache,
  writeNearbyContinuity,
} from '../services/nearbyCache';
import { captureConsumerCoreLoopEvent, captureConsumerDiscovery, captureConsumerRouteIntent } from '../services/consumerTelemetry';
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

const DRAFT_KEY = 'kleenest.native.route.draft';
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
  return Boolean(query) && (
    /\d/.test(query)
    || /,/.test(query)
    || /\b\d{5}(?:-\d{4})?\b/.test(query)
    || /\s[A-Z]{2}$/i.test(query)
    || /\b(street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|highway|hwy\.?|parkway|pkwy\.?|court|ct\.?|circle|place|plaza|way)\b/i.test(query)
    || /\b(school|academy|college|university|campus|hospital|clinic|medical center|airport|station|terminal|park|library|church|synagogue|mosque|temple|stadium|arena|museum|hotel|motel|resort|courthouse|city hall)\b/i.test(query)
  );
};
const navigateUrl = (row: any) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${row.latitude},${row.longitude}`)}&travelmode=driving`;

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
  return (
    <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}, selected && s.cardActive]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${item.name || 'Restroom location'}, ${route && ahead != null ? `${ahead.toFixed(ahead < 10 ? 1 : 0)} miles ahead` : distanceLabel(item.distance_meters)}`}
        onPress={onSelect}
        style={s.cardMain}
      >
        <View style={s.cardTop}>
          <FreshnessHeatRing item={item} size={34} photoUrl={item.consumer_photo_url ? String(item.consumer_photo_url) : undefined} />
          <View style={{ flex: 1 }}>
            <View style={s.cardTitleRow}>
              <Text style={[s.cardTitle,{color:theme.ink}]}>{item.name || 'Restroom location'}</Text>
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start directions to this location"
          accessibilityHint="Start navigation"
          disabled={!hasCoordinates(item)}
          style={[s.primarySmall,s.cardAction,{backgroundColor:theme.accent},!hasCoordinates(item)&&s.disabled]}
          onPress={onDirections}
        >
          <Text style={[s.primaryText,{color:theme.accentText}]}>Go →</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={item.active_check_in?'Already checked in at this location':checkInBusy?'Checking your location':item.visit_verification_available?'Verify your detected visit at this location':'Verify that I am at this location'} accessibilityHint="Check in" accessibilityState={{disabled:Boolean(item.active_check_in)||checkInBusy,busy:checkInBusy}} disabled={Boolean(item.active_check_in)||checkInBusy} style={[s.secondarySmall,s.cardAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line},(item.active_check_in||checkInBusy)&&s.disabled]} onPress={onCheckIn}>
          <Text style={[s.secondaryText,{color:theme.accent}]}>{item.active_check_in?'Checked in ✓':checkInBusy?'Checking location…':item.visit_verification_available?'Verify visit':"I'm here"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={[s.secondarySmall,s.cardAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={onAddToRoute}>
          <Text style={[s.secondaryText,{color:theme.accent}]}>Add to route</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Share what I already know about this location" style={[s.secondarySmall,s.cardAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={onKnow}>
          <Text style={[s.secondaryText,{color:theme.accent}]}>I know this place</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={[s.secondarySmall,s.cardAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={onDetails}>
          <Text style={[s.secondaryText,{color:theme.accent}]}>Full details</Text>
        </Pressable>
      </View>
      <CheckInStatus feedback={checkInFeedback} onReview={onReview} />
    </View>
  );
}

export default function AdaptiveExploreScreen() {
 const theme=useConsumerTheme();
  const insets=useSafeAreaInsets();
  const {height:windowHeight}=useWindowDimensions();
  const exploreMapHeight=Math.max(360,Math.min(480,Math.round(windowHeight*0.44)));
  const listRef=useRef<any>(null);
  const [mode, setMode] = useState<'nearby' | 'route'>('nearby');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [mapZoom, setMapZoom] = useState(13);
  const [cameraNonce, setCameraNonce] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
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
  const [checkInFeedback,setCheckInFeedback]=useState<Record<string,CheckInActionFeedback>>({});
  const [cached, setCached] = useState(false);
  const [mapInteracting,setMapInteracting]=useState(false);
  const searchPanelTop=Platform.OS==='android'?Math.max(8,insets.top+4):8;
  const mapChromeTop=10;

  const equippedMapFilter=String(rewardCapabilities?.equipped?.map_filter?.reward_key||'');
  const equippedMapFlair=String(rewardCapabilities?.equipped?.map_flair?.reward_key||'');
  const precisionFilterEquipped=equippedMapFilter==='precision';
  const progressionFilterEquipped=equippedMapFilter==='progression-opportunities';
  const evidenceGapRadar=Boolean(rewardCapabilities?.beta_features?.evidence_gap_radar);
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
    if(progressionPriority&&progressionFilterEquipped)return [...filtered].sort((a,b)=>Number(Boolean(b?.progression_opportunity))-Number(Boolean(a?.progression_opportunity)));
    return filtered;
  },[rows,kleenestOnly,progressionOnly,minimumStars,freshnessDays,verifiedEvidenceOnly,evidenceGapOnly,progressionPriority,progressionFilterEquipped]);
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
    () => amenities
      .filter((item) => FILTER_CATEGORIES.has(String(item.category || '')))
      .slice(0, 24),
    [amenities],
  );
  const routeBounds = useMemo(() => {
    if (!route?.geometry?.coordinates?.length || selected) return null;
    const points = route.geometry.coordinates as [number, number][];
    let west = Math.min(...points.map((point) => point[0]));
    let east = Math.max(...points.map((point) => point[0]));
    let south = Math.min(...points.map((point) => point[1]));
    let north = Math.max(...points.map((point) => point[1]));
    if (west === east) { west -= 0.01; east += 0.01; }
    if (south === north) { south -= 0.01; north += 0.01; }
    return [west, south, east, north] as [number, number, number, number];
  }, [route, selectedId]);
  const routeGap = useMemo(() => {
    if (!route || !visibleRows.length) return null;
    const fractions = [
      0,
      ...visibleRows
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
        : [...current, name],
    );
  }

  function resetFilters(){
    setKleenestOnly(false);
    setProgressionOnly(false);
    setMinimumStars(0);
    setFreshnessDays(null);
    setVerifiedEvidenceOnly(false);
    setEvidenceGapOnly(false);
    setProgressionPriority(false);
    setSelectedAmenityNames([]);
    setMatchRule('all');
    setAutoExpand(true);
    chooseRadius(1609);
    setMaxRadius(402336);
    setCorridor(16093);
  }

  function selectRow(row: any) {
    const id = idOf(row);
    if(id)captureConsumerCoreLoopEvent('place_selected',id,{source:'explore'});
    setSelectedId(id);
    if (hasCoordinates(row)) {
      setMapCenter([Number(row.longitude), Number(row.latitude)]);
      setMapZoom(14);
      setCameraNonce((value) => value + 1);
    }
    if (mode === 'nearby' && id) void writeNearbyContinuity(id, radius);
  }

  function chooseRadius(nextRadius: number) {
    setRadius(nextRadius);
    setEffectiveRadiusMeters(nextRadius);
    if (maxRadius < nextRadius) setMaxRadius(nextRadius);
    if (selectedId) void writeNearbyContinuity(selectedId, nextRadius);
  }

  function chooseMode(next: 'nearby' | 'route') {
    if (next === mode) return;
    setMode(next);
    setRows([]);
    setSelectedId('');
    setRoute(null);
    if(next==='route'){setSearchAreaOrigin(null);setSearchAreaLabel('');}
    setAttemptedRadiiMeters([]);
    setCached(false);
    setMessage(
      next === 'nearby'
        ? 'Search nearby bathrooms.'
        : 'Along route uses your saved route draft and current location.',
    );
  }

  function recenterMap() {
    const target=searchAreaOrigin||origin;
    if (!target) return;
    setSelectedId('');
    setPendingMapOrigin(null);
    setMapCenter(target);
    setMapZoom(13);
    setCameraNonce((value) => value + 1);
  }

  function handleMapRegionDidChange(event:any){
    setMapInteracting(false);
    const viewState=event?.nativeEvent;
    if(mode!=='nearby'||!viewState?.userInteraction||!Array.isArray(viewState.center))return;
    const next:[number,number]=[Number(viewState.center[0]),Number(viewState.center[1])];
    if(!Number.isFinite(next[0])||!Number.isFinite(next[1]))return;
    const activeOrigin=searchAreaOrigin||origin;
    if(activeOrigin&&Math.abs(next[0]-activeOrigin[0])+Math.abs(next[1]-activeOrigin[1])<0.002)return;
    setPendingMapOrigin(next);
  }

  function changeMapZoom(delta: number) {
    setMapZoom((current) => Math.min(18, Math.max(7, current + delta)));
    setCameraNonce((value) => value + 1);
  }

  async function enrich(data: any[]) {
    const ids = data.map(idOf).filter(Boolean);
    const [summaries,networkStatuses] = ids.length
      ? await Promise.all([
          listLocationTrustSummaries(ids).catch(() => []),
          listLocationNetworkStatuses(ids).catch(() => []),
        ])
      : [[],[]];
    const trusted=attachLocationTrust(data, summaries);
    const networked=attachLocationNetwork(trusted,networkStatuses);
    return attachLocationPresentations(networked).catch(()=>networked);
  }

  async function enrichProgression(data:any[],latitude:number,longitude:number,radiusMeters:number){
    try{
      const opportunities=await listNearbyProgressionOpportunities(latitude,longitude,Math.min(402336,Math.max(5000,Math.round(radiusMeters))));
      const byId=new globalThis.Map<string,any>((opportunities||[]).map((item:any)=>[String(item.location_id),item]));
      return data.map((row)=>({...row,progression_opportunity:byId.has(idOf(row)),progression_opportunity_detail:byId.get(idOf(row))||null}));
    }catch{
      return data.map((row)=>({...row,progression_opportunity:false,progression_opportunity_detail:null}));
    }
  }

  async function currentLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      throw new Error(
        'Location access is needed for restroom discovery. Enable it in phone settings and try again.',
      );
    }
    const lastKnown=await Location.getLastKnownPositionAsync().catch(()=>null);
    const recentLastKnown=lastKnown&&Date.now()-Number(lastKnown.timestamp||0)<=15*60*1000?lastKnown:null;
    const current = recentLastKnown || await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }).catch(async (freshLocationError) => {
      if (!lastKnown) throw freshLocationError;
      return lastKnown;
    });
    const point: [number, number] = [current.coords.longitude, current.coords.latitude];
    setOrigin(point);
    if (!selectedId) setMapCenter(point);
    return current;
  }

  async function loadNearby(clearQuery = false, preserveCacheOnEmpty = false, overrideOrigin:[number,number]|null=null) {
    const rawQuery=clearQuery?'':search.trim();
    if(clearQuery){setSearch('');setSearchAreaOrigin(null);setSearchAreaLabel('');setPendingMapOrigin(null);}

    let areaMatch:{origin:[number,number];label:string}|null=null;
    if(rawQuery&&looksLikeAddressOrArea(rawQuery)){
      const match=await resolveConsumerSearchLocation(rawQuery);
      if(!match)throw new Error(`Kleenest could not locate “${rawQuery}”. Try the street number plus city/state or ZIP.`);
      areaMatch={origin:[match.longitude,match.latitude],label:match.label||rawQuery};
    }

    const retainedMapOrigin=!rawQuery&&searchAreaLabel==='Map area'&&searchAreaOrigin?searchAreaOrigin:null;
    const mapAreaOrigin=overrideOrigin||retainedMapOrigin;
    const current=areaMatch||mapAreaOrigin?null:await currentLocation();
    const livePresence=areaMatch||mapAreaOrigin
      ? await refreshConsumerPresence().catch(()=>null)
      : await recordConsumerPresenceAt(Number(current!.coords.latitude),Number(current!.coords.longitude)).catch(()=>null);
    const nextOrigin:[number,number]=areaMatch
      ? areaMatch.origin
      : mapAreaOrigin
        ? mapAreaOrigin
        : [Number(current!.coords.longitude),Number(current!.coords.latitude)];
    const latitude=nextOrigin[1],longitude=nextOrigin[0];
    const query=areaMatch?'':rawQuery;
    if(areaMatch){setSearchAreaOrigin(areaMatch.origin);setSearchAreaLabel(areaMatch.label);setPendingMapOrigin(null);}
    else if(overrideOrigin){setSearch('');setSearchAreaOrigin(overrideOrigin);setSearchAreaLabel('Map area');setPendingMapOrigin(null);}
    else if(rawQuery){setSearchAreaOrigin(null);setSearchAreaLabel('');setPendingMapOrigin(null);}

    let result: any;
    let usedMatureFallback = false;
    try {
      result = await findAdaptiveNearbyRestrooms({
        latitude,
        longitude,
        requestedRadiusMeters: radius,
        maxRadiusMeters: maxRadius,
        search: query,
        amenityNames: selectedAmenityNames,
        amenityMatch: matchRule,
        autoExpand: selectedAmenityNames.length ? autoExpand : true,
        hardRadius: selectedAmenityNames.length > 0 && !autoExpand,
        limit: 500,
      });
    } catch (error) {
      if (matchRule !== 'all') throw error;
      const legacyRows = await listNearbyRestrooms(latitude,longitude,radius,query,selectedAmenityNames);
      result = { rows: legacyRows, requestedRadiusMeters: radius, effectiveRadiusMeters: radius, attemptedRadiiMeters: [radius], expanded: false };
      usedMatureFallback = true;
    }

    let discoveryRows=result.rows;
    let relaxedAmenityFallback=false;
    if(!discoveryRows.length&&selectedAmenityNames.length&&autoExpand&&!query){
      const fallbackResult=await findAdaptiveNearbyRestrooms({
        latitude,
        longitude,
        requestedRadiusMeters:1609,
        maxRadiusMeters:maxRadius,
        search:'',
        amenityNames:[],
        amenityMatch:'any',
        autoExpand:true,
        hardRadius:false,
        limit:500,
      });
      discoveryRows=fallbackResult.rows;
      if(discoveryRows.length){
        result={...fallbackResult,requestedAmenityFallback:true};
        relaxedAmenityFallback=true;
      }
    }
    const enrichedBase = await enrich(discoveryRows);
    const enriched = organizeDiscoveryRows(
      attachPresence(await enrichProgression(enrichedBase,latitude,longitude,result.effectiveRadiusMeters),livePresence),
      selectedAmenityNames,
    );
    if (!areaMatch&&!enriched.length && preserveCacheOnEmpty && !query && !selectedAmenityNames.length) {
      const fallback = await readNearbyCache();
      if (fallback?.rows?.length) {
        const fallbackSelected = selectedId && fallback.rows.some((row: any) => idOf(row) === selectedId) ? selectedId : '';
        setRows(attachPresence(fallback.rows,livePresence));setSelectedId(fallbackSelected);setRoute(null);
        if (fallback.origin) {setOrigin(fallback.origin);setMapCenter(fallback.origin);}
        if (fallback.radiusMeters) {setRadius(fallback.radiusMeters);setEffectiveRadiusMeters(fallback.radiusMeters);}
        setAttemptedRadiiMeters(result.attemptedRadiiMeters || []);setCached(true);
        setMessage(`Live lookup returned no usable locations on first load. Showing cached nearby results from ${cachedAgeLabel(fallback.savedAt)} while you can refresh for a new live result.`);
        return;
      }
    }

    const verificationCandidates = enriched.filter((row) => row?.needs_restroom_verification === true).length;
    const restroomEvidence = enriched.length - verificationCandidates;
    const preservedId = selectedId && enriched.some((row) => idOf(row) === selectedId) ? selectedId : '';
    setRows(enriched);setRoute(null);
    if (!preservedId) setMapCenter(nextOrigin);
    setEffectiveRadiusMeters(result.effectiveRadiusMeters);setAttemptedRadiiMeters(result.attemptedRadiiMeters);setCached(false);setSelectedId(preservedId);

    captureConsumerDiscovery({latitude,longitude,radiusMeters:result.effectiveRadiusMeters,resultCount:enriched.length,search:rawQuery,amenityCount:selectedAmenityNames.length});
    captureConsumerCoreLoopEvent('nearby_results_shown',null,{resultCount:enriched.length,radiusMeters:result.effectiveRadiusMeters,search:Boolean(rawQuery),cached:false});

    if (!areaMatch&&!query && !selectedAmenityNames.length && enriched.length) {
      void writeNearbyCache(enriched,{selectedId:preservedId,origin:nextOrigin,radiusMeters:result.effectiveRadiusMeters});
    }

    if(areaMatch){
      setMessage(enriched.length
        ? `${enriched.length} bathroom${enriched.length===1?'':'s'} found while searching near ${areaMatch.label} within ${radiusLabel(result.effectiveRadiusMeters)}${result.expanded?' after adaptive expansion':''}.`
        : `No qualifying bathrooms found while searching near ${areaMatch.label} through ${radiusLabel(result.effectiveRadiusMeters)}.`);
    } else if (usedMatureFallback) {
      setMessage(enriched.length?`${enriched.length} nearby bathroom${enriched.length===1?'':'s'} found using the proven nearby search path while adaptive discovery recovers.`:'No bathrooms matched the current nearby search.');
    } else if (relaxedAmenityFallback) {
      setMessage(`No exact amenity match was found through your expanded search, so Kleenest kept the page useful with ${enriched.length} nearby place${enriched.length===1?'':'s'}. Results are organized by freshness, Kleenest status, amenities, then distance.`);
    } else if (!query && !selectedAmenityNames.length) {
      setMessage(enriched.length
        ? (result.expanded?`Expanded nearby search through ${result.attemptedRadiiMeters.map(radiusLabel).join(' → ')}.`:'')
        : 'Live discovery returned no local data, so Kleenest will keep the last useful nearby set when one is available.');
    } else if (result.expanded) {
      setMessage(enriched.length?`Expanded through ${result.attemptedRadiiMeters.map(radiusLabel).join(' → ')} and found ${enriched.length} qualifying location${enriched.length===1?'':'s'}.`:`No qualifying locations found after expanding through ${radiusLabel(result.effectiveRadiusMeters)}.`);
    } else {
      setMessage(enriched.length?`${enriched.length} qualifying bathroom${enriched.length===1?'':'s'} within ${radiusLabel(result.effectiveRadiusMeters)}.`:`No qualifying bathrooms found within ${radiusLabel(result.effectiveRadiusMeters)}.`);
    }
  }

  async function loadRoute() {
    const current = await currentLocation();
    const raw = await SecureStore.getItemAsync(DRAFT_KEY);
    const stopIds = parseRouteDraft(raw);
    if (!stopIds.length) {
      throw new Error(
        'Your route has no stops yet. Open Route, add at least one destination bathroom, then search along it.',
      );
    }
    const built = await buildMobileRoute(
      [current.coords.longitude, current.coords.latitude],
      stopIds,
    );
    if (!built?.geometry) throw new Error('The saved route could not produce route geometry.');
    const data = await listRestroomsAlongRoute({
      routeGeoJSON: built.geometry,
      corridorMeters: corridor,
      search: search.trim(),
      amenityNames: selectedAmenityNames,
      amenityMatch: matchRule,
      limit: 40,
    });
    const enrichedBase = await enrich(data);
    const progressionRadius=Math.min(402336,Math.max(corridor,Math.round((Number(built.distanceMiles||0)+10)*1609.344)));
    const livePresence=await recordConsumerPresenceAt(current.coords.latitude,current.coords.longitude).catch(()=>null);
    const enriched = attachPresence(await enrichProgression(enrichedBase,current.coords.latitude,current.coords.longitude,progressionRadius),livePresence);
    setRows(enriched);
    setRoute(built);
    setSelectedId('');
    setCached(false);
    setAttemptedRadiiMeters([]);
    setMapCenter([current.coords.longitude, current.coords.latitude]);
    setMessage(
      enriched.length
        ? `${enriched.length} qualifying bathroom${enriched.length === 1 ? '' : 's'} along your ${Number(built.distanceMiles || 0).toFixed(0)} mi route, within ${radiusLabel(corridor)} of the route.`
        : `No qualifying bathrooms found within ${radiusLabel(corridor)} of this route.`,
    );
  }

  async function load(options: { clearQuery?: boolean; preserveCacheOnEmpty?: boolean; mapOrigin?: [number,number] | null } = {}) {
    if (loading) return;
    setLoading(true);
    setMessage(mode === 'nearby' ? 'Searching nearby…' : 'Building route and searching its corridor…');
    try {
      if (mode === 'nearby') await loadNearby(
        Boolean(options.clearQuery),
        Boolean(options.preserveCacheOnEmpty),
        options.mapOrigin||null,
      );
      else await loadRoute();
    } catch (error: any) {
      const canUseGenericCache = !search.trim() && !selectedAmenityNames.length;
      if (mode === 'nearby' && canUseGenericCache) {
        const fallback = await readNearbyCache();
        if (fallback?.rows?.length) {
          const fallbackSelected = selectedId && fallback.rows.some((row: any) => idOf(row) === selectedId)
            ? selectedId
            : '';
          setRows(fallback.rows);
          setSelectedId(fallbackSelected);
          if (fallback.origin) {
            setOrigin(fallback.origin);
            setMapCenter(fallback.origin);
          }
          if (fallback.radiusMeters) setRadius(fallback.radiusMeters);
          setCached(true);
          setMessage(
            `Live lookup failed. Showing cached bathrooms from ${cachedAgeLabel(fallback.savedAt)}; pull to refresh for a live result.`,
          );
          setLoading(false);
          return;
        }
      }
      setRows([]);
      setSelectedId('');
      setRoute(null);
      setMessage(error?.message || 'Bathroom search failed.');
    } finally {
      setLoading(false);
    }
  }

  function addToRoute(row: any) {
    const id = idOf(row);
    if (!id) return;
    captureConsumerRouteIntent(id);
    router.push({ pathname: '/route', params: { add: id } });
  }

  function contributeKnowledge(row: any) {
    const id = idOf(row);
    if (!id) return;
    router.push({ pathname: '/knowledge', params: { locationId: id, name: String(row?.name || '') } });
  }

  async function directions(row: any) {
    if (!hasCoordinates(row)) return;
    const id = idOf(row);
    if (id) {
      captureConsumerRouteIntent(id);
      captureConsumerCoreLoopEvent('navigation_started',id,{source:'explore'});
    }
    await Linking.openURL(navigateUrl(row));
  }

  async function checkIn(row:any){
    const id=idOf(row);if(!id)return;
    if(checkInFeedback[id]?.status==='checking')return;
    const placeName=String(row?.name||'this restroom');
    setSelectedId(id);
    setCheckInFeedback(current=>({...current,[id]:{status:'checking',message:`Checking your location for ${placeName}…`}}));
    try{
      const permission=await Location.requestForegroundPermissionsAsync();
      if(permission.status!=='granted')throw new Error(permission.canAskAgain===false?'Location permission is blocked in system settings.':'Location permission is required to check in.');
      const current=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
      const result:any=await mobileCheckIn(id,current.coords.latitude,current.coords.longitude);
      const distance=result?.distance_meters!=null?` · ${Math.round(Number(result.distance_meters))} m proof`:'';
      const points=Math.max(0,Number(result?.points_awarded||0));
      const windowLabel=verificationWindowLabel(result?.verification_expires_at);
      const rewardLabel=!result?.already_checked_in&&points>0?` · +${points} points`:(!result?.already_checked_in&&result?.progression_cap_reached?' · visit saved; today’s XP cap reached':'');
      const reviewLabel=result?.review_ready?' · verified review ready':'';
      const successMessage=result?.already_checked_in
        ? `Visit already verified at ${placeName}${distance}${reviewLabel}${windowLabel?` · ${windowLabel}`:''}.`
        : `Checked in at ${placeName}. Exact place + GPS verified${distance}${rewardLabel}${reviewLabel}${windowLabel?` · ${windowLabel}`:''}.`;
      setRows(currentRows=>currentRows.map(item=>idOf(item)===id?{...item,active_check_in:true,visit_verification_available:true,visit_verification_expires_at:result?.verification_expires_at||null}:item));
      setMessage(successMessage);
      setCheckInFeedback(current=>({...current,[id]:{
        status:'success',
        message:successMessage,
        reviewReady:Boolean(result?.review_ready),
        verificationExpiresAt:result?.verification_expires_at||null,
        pointsAwarded:points,
        progressionCapReached:Boolean(result?.progression_cap_reached),
        alreadyCheckedIn:Boolean(result?.already_checked_in),
      }}));
      captureConsumerCoreLoopEvent('arrival_detected',id,{reviewReady:Boolean(result?.review_ready),alreadyCheckedIn:Boolean(result?.already_checked_in)});
    }catch(error:any){
      const detail=String(error?.message||'');
      const failureMessage=detail.includes('OUTSIDE_GEOFENCE')
        ? `Get closer to ${placeName} to check in. Kleenest only verifies GPS check-ins inside the location geofence.`
        : detail.includes('LEAVE_REQUIRED_BEFORE_REPEAT_CHECK_IN')
          ? `You're already checked in at ${placeName} and haven't left its geofence yet.`
          : detail&&detail.length<120&&!/^[A-Z0-9_: =.-]+$/.test(detail)
            ? detail
            : 'Check-in could not be completed. Please try again.';
      setMessage(failureMessage);
      setCheckInFeedback(current=>({...current,[id]:{status:'error',message:failureMessage}}));
    }
  }

  useEffect(() => {
    listAmenityCatalog().then(setAmenities).catch(() => {});
    getRewardCapabilities().then(setRewardCapabilities).catch(()=>setRewardCapabilities({}));
    let active = true;
    Promise.all([readNearbyCache(), readNearbyContinuity()])
      .then(([cache, continuity]) => {
        if (!active) return;
        if (
          continuity?.radiusMeters &&
          radiusChoices.some((choice) => choice.meters === continuity.radiusMeters)
        ) {
          setRadius(continuity.radiusMeters);
          setEffectiveRadiusMeters(continuity.radiusMeters);
        }
        if (cache?.rows?.length) {
          setRows(cache.rows);
          const restoredSelectedId=
            continuity?.selectedId && cache.rows.some((row:any)=>idOf(row)===continuity.selectedId)
              ? continuity.selectedId
              : cache.selectedId && cache.rows.some((row:any)=>idOf(row)===cache.selectedId)
                ? cache.selectedId
                : '';
          if(restoredSelectedId)setSelectedId(restoredSelectedId);
          if (cache.origin) {
            setOrigin(cache.origin);
            const restoredRow=restoredSelectedId?cache.rows.find((row:any)=>idOf(row)===restoredSelectedId):null;
            setMapCenter(restoredRow&&hasCoordinates(restoredRow)
              ? [Number(restoredRow.longitude),Number(restoredRow.latitude)]
              : cache.origin);
          }
          setCached(true);
          setMessage(
            `Showing your last nearby bathrooms from ${cachedAgeLabel(cache.savedAt)} while current results load.`,
          );
        }
      })
      .finally(() => {
        if (active) void load({ preserveCacheOnEmpty: true });
      });
    return () => { active = false; };
  }, []);

  const cameraViewState: any = routeBounds
    ? { bounds: routeBounds, padding: { top: 28, right: 28, bottom: 28, left: 28 } }
    : { center: mapCenter || searchAreaOrigin || origin || [0, 0], zoom: mapZoom };

  return (
    <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}>
      <FlatList
        ref={listRef}
        style={s.pageScroll}
        data={visibleRows}
        scrollEnabled={!mapInteracting}
        nestedScrollEnabled
        keyExtractor={idOf}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        ListHeaderComponent={
          <View style={s.exploreCanvas}>
      <View style={[s.searchPanel,{marginTop:searchPanelTop,backgroundColor:theme.surface,borderColor:theme.line}]}>
        <View style={s.searchRow}>
          <TextInput
            accessibilityLabel="Search bathrooms"
            style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}
            maxFontSizeMultiplier={1.2}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => void load()}
            returnKeyType="search"
            placeholder="Address, school, workplace, city or brand"
            placeholderTextColor={theme.muted}
          />
          <Pressable
            accessibilityRole="button"
            style={[s.searchButton,{backgroundColor:theme.accent}]}
            disabled={loading}
            onPress={() => void load()}
          >
            <Text maxFontSizeMultiplier={1.15} style={[s.searchButtonText,{color:theme.accentText}]}>{loading ? 'WORKING…' : 'SEARCH'}</Text>
          </Pressable>
        </View>

        {searchAreaLabel?<View style={[s.searchAreaChip,{backgroundColor:theme.accentSoft}]}><Text style={[s.searchAreaText,{color:theme.ink}]}>Searching near {searchAreaLabel}</Text><Pressable onPress={()=>{setSearch('');setSearchAreaOrigin(null);setSearchAreaLabel('');void load({clearQuery:true});}}><Text style={[s.searchAreaAction,{color:theme.accent}]}>Use my location</Text></Pressable></View>:null}

        <View style={[s.segment,{backgroundColor:theme.surfaceRaised}]} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nearby search"
            accessibilityState={{ selected: mode === 'nearby' }}
            onPress={() => chooseMode('nearby')}
            style={[s.segmentButton,mode==='nearby'&&{backgroundColor:theme.accent}]}
          >
            <Text maxFontSizeMultiplier={1.15} style={[s.segmentText,{color:mode==='nearby'?theme.accentText:theme.ink}]}>Nearby</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Along route search"
            accessibilityState={{ selected: mode === 'route' }}
            onPress={() => chooseMode('route')}
            style={[s.segmentButton,mode==='route'&&{backgroundColor:theme.accent}]}
          >
            <Text maxFontSizeMultiplier={1.15} style={[s.segmentText,{color:mode==='route'?theme.accentText:theme.ink}]}>Along route</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filter places"
          accessibilityState={{ expanded: showAdvanced }}
          onPress={() => setShowAdvanced(true)}
          style={[s.filterLauncher,{backgroundColor:theme.surface,borderColor:theme.line}]}
        >
          <View style={s.filterLauncherMain}>
            <Text maxFontSizeMultiplier={1.1} style={[s.filterLauncherKicker,{color:theme.muted}]}>FILTER</Text>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={[s.filterLauncherTitle,{color:theme.ink}]}>{filterSummary}</Text>
          </View>
          <View style={[s.filterLauncherBadge,{backgroundColor:theme.accentSoft}]}><Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={[s.filterLauncherBadgeText,{color:theme.accent}]}>{activeFilterCount?`${activeFilterCount} active`:'Everything'} ▾</Text></View>
        </Pressable>
        <Modal
          transparent
          animationType="fade"
          visible={showAdvanced}
          onRequestClose={() => setShowAdvanced(false)}
        >
          <View style={s.modalBackdrop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close place filters"
              style={StyleSheet.absoluteFill}
              onPress={() => setShowAdvanced(false)}
            />
            <View style={[s.advancedModalCard,{backgroundColor:theme.surface,borderColor:theme.line}]}>
              <View style={s.advancedModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.advancedModalTitle,{color:theme.ink}]}>Filter places</Text>
                  <Text style={[s.help,{color:theme.muted}]}>Default is Everything. Narrow the map only when you want a specific kind of stop.</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close place filters"
                  style={[s.modalClose,{backgroundColor:theme.accentSoft}]}
                  onPress={() => setShowAdvanced(false)}
                >
                  <Text style={[s.modalCloseText,{color:theme.accent}]}>×</Text>
                </Pressable>
              </View>
              <ScrollView
                style={s.advancedModalScroll}
                contentContainerStyle={s.advancedModalContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={s.filterSection}>
                  <View style={s.rowHeading}>
                    <Text style={[s.filterSectionTitle,{color:theme.ink}]}>High-value filters</Text>
                    <Pressable onPress={resetFilters}><Text style={[s.clear,{color:theme.accent}]}>Reset to Everything</Text></Pressable>
                  </View>
                  <View style={s.quickFilterGrid}>
                    <Pressable accessibilityRole="checkbox" accessibilityState={{checked:kleenestOnly}} style={[s.quickFilterCard,{backgroundColor:kleenestOnly?theme.accent:theme.surfaceRaised,borderColor:kleenestOnly?theme.accent:theme.line}]} onPress={()=>setKleenestOnly(value=>!value)}>
                      <Text style={[s.quickFilterTitle,{color:kleenestOnly?theme.accentText:theme.ink}]}>Kleenest places</Text>
                      <Text style={[s.quickFilterBody,{color:kleenestOnly?theme.accentText:theme.muted}]}>Paying Kleenest business locations</Text>
                    </Pressable>
                    <Pressable accessibilityRole="checkbox" accessibilityState={{checked:progressionOnly}} style={[s.quickFilterCard,{backgroundColor:progressionOnly?theme.accent:theme.surfaceRaised,borderColor:progressionOnly?theme.accent:theme.line}]} onPress={()=>setProgressionOnly(value=>!value)}>
                      <Text style={[s.quickFilterTitle,{color:progressionOnly?theme.accentText:theme.ink}]}>Progression</Text>
                      <Text style={[s.quickFilterBody,{color:progressionOnly?theme.accentText:theme.muted}]}>Places with XP / evidence opportunities</Text>
                    </Pressable>
                    {precisionFilterEquipped?<Pressable accessibilityRole="checkbox" accessibilityState={{checked:verifiedEvidenceOnly}} style={[s.quickFilterCard,{backgroundColor:verifiedEvidenceOnly?theme.accent:theme.surfaceRaised,borderColor:verifiedEvidenceOnly?theme.accent:theme.line}]} onPress={()=>setVerifiedEvidenceOnly(value=>!value)}>
                      <Text style={[s.quickFilterTitle,{color:verifiedEvidenceOnly?theme.accentText:theme.ink}]}>Verified evidence</Text>
                      <Text style={[s.quickFilterBody,{color:verifiedEvidenceOnly?theme.accentText:theme.muted}]}>Precision reward · current evidence-backed places only</Text>
                    </Pressable>:null}
                    {(precisionFilterEquipped||evidenceGapRadar)?<Pressable accessibilityRole="checkbox" accessibilityState={{checked:evidenceGapOnly}} style={[s.quickFilterCard,{backgroundColor:evidenceGapOnly?theme.accent:theme.surfaceRaised,borderColor:evidenceGapOnly?theme.accent:theme.line}]} onPress={()=>setEvidenceGapOnly(value=>!value)}>
                      <Text style={[s.quickFilterTitle,{color:evidenceGapOnly?theme.accentText:theme.ink}]}>Evidence gaps</Text>
                      <Text style={[s.quickFilterBody,{color:evidenceGapOnly?theme.accentText:theme.muted}]}>{evidenceGapRadar?'Labs Radar · weak or stale evidence':'Precision reward · weak or stale evidence'}</Text>
                    </Pressable>:null}
                    {progressionFilterEquipped?<Pressable accessibilityRole="checkbox" accessibilityState={{checked:progressionPriority}} style={[s.quickFilterCard,{backgroundColor:progressionPriority?theme.accent:theme.surfaceRaised,borderColor:progressionPriority?theme.accent:theme.line}]} onPress={()=>setProgressionPriority(value=>!value)}>
                      <Text style={[s.quickFilterTitle,{color:progressionPriority?theme.accentText:theme.ink}]}>Progression first</Text>
                      <Text style={[s.quickFilterBody,{color:progressionPriority?theme.accentText:theme.muted}]}>Reward filter · move nearby progression opportunities to the top</Text>
                    </Pressable>:null}
                  </View>
                </View>

                <View style={s.filterSection}>
                  <Text style={[s.filterSectionTitle,{color:theme.ink}]}>Stars</Text>
                  <View style={s.choiceRow}>
                    {[{label:'Any',value:0},{label:'3★+',value:3},{label:'4★+',value:4},{label:'4.5★+',value:4.5}].map(choice=><Pressable key={choice.label} style={[s.choice,{backgroundColor:minimumStars===choice.value?theme.accent:theme.surfaceRaised,borderColor:minimumStars===choice.value?theme.accent:theme.line}]} onPress={()=>setMinimumStars(choice.value)}><Text style={[s.choiceText,{color:minimumStars===choice.value?theme.accentText:theme.ink}]}>{choice.label}</Text></Pressable>)}
                  </View>
                </View>

                <View style={s.filterSection}>
                  <Text style={[s.filterSectionTitle,{color:theme.ink}]}>Freshness</Text>
                  <View style={s.choiceRow}>
                    {[{label:'Any',value:null},{label:'24h',value:1},{label:'7d',value:7},{label:'30d',value:30}].map(choice=><Pressable key={choice.label} style={[s.choice,{backgroundColor:freshnessDays===choice.value?theme.accent:theme.surfaceRaised,borderColor:freshnessDays===choice.value?theme.accent:theme.line}]} onPress={()=>setFreshnessDays(choice.value)}><Text style={[s.choiceText,{color:freshnessDays===choice.value?theme.accentText:theme.ink}]}>{choice.label}</Text></Pressable>)}
                  </View>
                </View>

                {mode === 'nearby' ? (
                  <View style={s.filterSection}>
                    <View style={s.rowHeading}><Text style={[s.filterSectionTitle,{color:theme.ink}]}>Starting radius</Text><Text style={s.autoLabel}>Local search</Text></View>
                    <View accessibilityRole="radiogroup"><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choiceRow}>
                      {radiusChoices.map(choice=><Pressable accessibilityRole="radio" accessibilityState={{ selected: radius === choice.meters }} key={choice.meters} style={[s.choice,{backgroundColor:radius===choice.meters?theme.accent:theme.surfaceRaised,borderColor:radius===choice.meters?theme.accent:theme.line}]} onPress={()=>chooseRadius(choice.meters)}><Text style={[s.choiceText,{color:radius===choice.meters?theme.accentText:theme.ink}]}>{choice.label}</Text></Pressable>)}
                    </ScrollView></View>
                  </View>
                ) : null}

                <View style={s.filterSection}>
                  <View style={s.amenityHeading}><Text style={[s.filterSectionTitle,{color:theme.ink}]}>What matters on this stop?</Text>{selectedAmenityNames.length?<Pressable onPress={()=>setSelectedAmenityNames([])}><Text style={[s.clear,{color:theme.accent}]}>Clear amenities</Text></Pressable>:null}</View>
                  {filterAmenities.length?<View style={s.amenityWrap}>{filterAmenities.map(item=><Pressable accessibilityRole="checkbox" accessibilityState={{checked:selectedAmenityNames.includes(item.name)}} key={item.id} style={[s.amenityPill,{backgroundColor:selectedAmenityNames.includes(item.name)?theme.accent:theme.surfaceRaised,borderColor:selectedAmenityNames.includes(item.name)?theme.accent:theme.line}]} onPress={()=>toggleAmenity(item.name)}><Text style={[s.amenityText,{color:selectedAmenityNames.includes(item.name)?theme.accentText:theme.ink}]}>{item.name}</Text></Pressable>)}</View>:<Text style={[s.help,{color:theme.muted}]}>Amenity catalog is loading.</Text>}
                </View>
                {mode === 'nearby' ? (
                  <>
                    <View style={s.rowHeading}>
                      <Text style={s.filterTitle}>Adaptive amenity search</Text>
                      <View style={s.autoRow}>
                        <Text style={s.autoLabel}>Expand for required amenities</Text>
                        <Switch
                          disabled={!selectedAmenityNames.length}
                          value={selectedAmenityNames.length > 0 && autoExpand}
                          onValueChange={setAutoExpand}
                        />
                      </View>
                    </View>
                    {selectedAmenityNames.length > 0 && autoExpand ? (
                      <View style={[s.inlineBlock,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
                        <Text style={s.filterTitle}>Maximum distance</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choiceRow}>
                          {maxChoices.map((choice) => {
                            const enabledValue = Math.max(radius, choice.meters);
                            return (
                              <Pressable
                                key={choice.meters}
                                style={[s.choice,{backgroundColor:maxRadius===enabledValue?theme.accent:theme.surfaceRaised,borderColor:maxRadius===enabledValue?theme.accent:theme.line}]}
                                onPress={() => setMaxRadius(enabledValue)}
                              >
                                <Text style={[s.choiceText,{color:maxRadius===enabledValue?theme.accentText:theme.ink}]}>{choice.label}</Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <View style={[s.inlineBlock,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
                    <View style={s.rowHeading}>
                      <Text style={s.filterTitle}>Route corridor</Text>
                      <Pressable onPress={() => { setShowAdvanced(false); router.push('/route'); }}>
                        <Text style={[s.linkText,{color:theme.accent}]}>Open Route planner</Text>
                      </Pressable>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choiceRow}>
                      {corridorChoices.map((choice) => (
                        <Pressable
                          key={choice.meters}
                          style={[s.choice,{backgroundColor:corridor===choice.meters?theme.accent:theme.surfaceRaised,borderColor:corridor===choice.meters?theme.accent:theme.line}]}
                          onPress={() => setCorridor(choice.meters)}
                        >
                          <Text style={[s.choiceText,{color:corridor===choice.meters?theme.accentText:theme.ink}]}>{choice.label}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {selectedAmenityNames.length ? (
                  <View style={s.ruleRow}>
                    <Pressable
                      onPress={() => setMatchRule('all')}
                      style={[s.rule,{backgroundColor:matchRule === 'all'?theme.accent:theme.surfaceRaised,borderColor:matchRule === 'all'?theme.accent:theme.line}]}
                    >
                      <Text style={[s.ruleText,{color:matchRule === 'all'?theme.accentText:theme.ink}]}>Must include all</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setMatchRule('any')}
                      style={[s.rule,{backgroundColor:matchRule === 'any'?theme.accent:theme.surfaceRaised,borderColor:matchRule === 'any'?theme.accent:theme.line}]}
                    >
                      <Text style={[s.ruleText,{color:matchRule === 'any'?theme.accentText:theme.ink}]}>Include any</Text>
                    </Pressable>
                  </View>
                ) : null}
              </ScrollView>
              <Pressable style={[s.modalDone,{backgroundColor:theme.accent}]} onPress={()=>{setShowAdvanced(false);void load();}}>
                <Text style={[s.primaryText,{color:theme.accentText}]}>Show results</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

      </View>

      {(origin||searchAreaOrigin) ? (
        <View style={s.mapSection}>
          <View style={[s.mapFrame,{height:exploreMapHeight}]}>
            <View
              style={s.mapGestureSurface}
              onTouchStart={()=>setMapInteracting(true)}
              onTouchMove={()=>{if(!mapInteracting)setMapInteracting(true)}}
              onTouchEnd={()=>setTimeout(()=>setMapInteracting(false),80)}
              onTouchCancel={()=>setMapInteracting(false)}
            >
            <Map androidView="texture" style={s.map} mapStyle={OSM_STYLE} onRegionDidChange={handleMapRegionDidChange}>
              <Camera
                key={`explore-camera-${cameraNonce}-${selectedId}-${mode}`}
                initialViewState={cameraViewState}
              />
              {route?.geometry ? (
                <GeoJSONSource
                  id="explore-route"
                  data={{ type: 'Feature', properties: {}, geometry: route.geometry } as any}
                >
                  <Layer
                    id="explore-route-line"
                    type="line"
                    paint={{ 'line-color': palette.green, 'line-width': 5, 'line-opacity': 0.85 } as any}
                  />
                </GeoJSONSource>
              ) : null}
              {origin?<Marker id="kleenest-user-location" lngLat={origin} anchor="center">
                <View pointerEvents="none" accessibilityLabel="Your current location" style={s.userLocationRing}>
                  <View style={s.userLocationDot} />
                </View>
              </Marker>:null}
              {searchAreaOrigin?<Marker id="searched-area-marker" lngLat={searchAreaOrigin} anchor="center">
                <View accessibilityLabel={`Search area: ${searchAreaLabel}`} style={[s.searchedAreaMarker,{backgroundColor:theme.surface,borderColor:theme.accent}]}><Text style={[s.searchedAreaMarkerText,{color:theme.accent}]}>◎</Text></View>
              </Marker>:null}
              {visibleRows.filter(hasCoordinates).map((row) => {
                const id = idOf(row);
                const active = id === selectedId;
                return (
                  <Marker
                    key={id}
                    id={`restroom-${id}`}
                    lngLat={[Number(row.longitude), Number(row.latitude)]}
                    anchor="bottom"
                    onPress={() => selectRow(row)}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={restroomMarkerLabel(row)}
                      hitSlop={14}
                      onPress={(event) => {
                        event.stopPropagation();
                        selectRow(row);
                      }}
                      style={[s.marker,active&&s.markerActive,equippedMapFlair==='freshness-halo'&&{borderWidth:3,borderColor:theme.accent,backgroundColor:theme.accentSoft},equippedMapFlair==='gold-ring'&&{borderWidth:3,borderColor:'#e7c45d',backgroundColor:'#3b3216'}]}
                    >
                      <FreshnessHeatRing item={row} size={22} />
                    </Pressable>
                  </Marker>
                );
              })}
            </Map>
            </View>
            <View style={[s.mapControls,{top:mapChromeTop}]}>
              <Pressable accessibilityRole="button" accessibilityLabel="Zoom map in" style={[s.mapControl,{backgroundColor:theme.surface,borderColor:theme.line}]} onPress={() => changeMapZoom(1)}>
                <Text style={[s.mapControlText,{color:theme.accent}]}>＋</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Zoom map out" style={[s.mapControl,{backgroundColor:theme.surface,borderColor:theme.line}]} onPress={() => changeMapZoom(-1)}>
                <Text style={[s.mapControlText,{color:theme.accent}]}>−</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={searchAreaOrigin?'Center map on searched area':'Center map on my location'} style={[s.mapControl,{backgroundColor:theme.surface,borderColor:theme.line}]} onPress={recenterMap}>
                <Text style={[s.mapControlText,{color:theme.accent}]}>⌖</Text>
              </Pressable>
            </View>
            {pendingMapOrigin&&mode==='nearby'?(
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Search this map area"
                style={[s.searchThisArea,{top:mapChromeTop,backgroundColor:theme.surface,borderColor:theme.line}]}
                disabled={loading}
                onPress={()=>void load({mapOrigin:pendingMapOrigin})}
              >
                <Text style={[s.searchThisAreaText,{color:theme.accent}]}>{loading?'Searching…':'Search this area'}</Text>
              </Pressable>
            ):null}
            <View pointerEvents="box-none" style={[s.legendWrap,{top:mapChromeTop+46}]}>
              <MapLegend />
            </View>
            {selected ? (
              <View pointerEvents="auto" style={[s.selectedPanel,{backgroundColor:theme.surface,borderColor:theme.line}]}>
                <View style={s.selectedHead}>
                  <Text style={[s.selectedLabel,{color:theme.accent}]}>BEST NEXT DECISION</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close selected location"
                    hitSlop={12}
                    onPress={() => setSelectedId('')}
                    style={[s.close,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}
                  >
                    <Text style={[s.closeText,{color:theme.accent}]}>×</Text>
                    <Text style={[s.closeLabel,{color:theme.muted}]}>Close</Text>
                  </Pressable>
                </View>
                <ScrollView style={s.selectedBodyScroll} contentContainerStyle={s.selectedBodyContent} showsVerticalScrollIndicator={false}>
                  <View style={s.selectedRow}>
                    <FreshnessHeatRing item={selected} size={34} photoUrl={selected.consumer_photo_url ? String(selected.consumer_photo_url) : undefined} />
                    <View style={{ flex: 1 }}>
                      <View style={s.cardTitleRow}>
                        <Text numberOfLines={1} style={[s.selectedTitle,{color:theme.ink,flexShrink:1}]}>{selected.name || 'Restroom location'}</Text>
                        {selected.discovery_recommended?<View style={[s.recommendedBadge,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}><Text style={[s.recommendedBadgeText,{color:theme.accent}]}>RECOMMENDED</Text></View>:null}
                      </View>
                      <Text numberOfLines={1} style={[s.selectedDecisionMeta,{color:theme.muted}]}>
                        {[selected.discovery_recommended?recommendationReason(selected,selectedAmenityNames):null,selectedRoutePosition || distanceLabel(selected.distance_meters)].filter(Boolean).join(' · ')}
                      </Text>
                      <Text numberOfLines={1} style={[s.meta,{color:theme.muted}]}>{[selected.address, selected.city].filter(Boolean).join(', ') || 'Address unavailable'}</Text>
                    </View>
                  </View>
                  <DecisionRestroomSignals item={selected} />
                  <RequestedAmenityMatches item={selected} requested={selectedAmenityNames} compact />
                  <View style={s.actionRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Start directions to this location"
                      accessibilityHint="Start navigation"
                      style={[s.primarySmall,s.selectedAction,{backgroundColor:theme.accent},!hasCoordinates(selected)&&s.disabled]}
                      disabled={!hasCoordinates(selected)}
                      onPress={() => void directions(selected)}
                    >
                      <Text style={[s.primaryText,{color:theme.accentText}]}>Go →</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={selected.active_check_in?'Already checked in at selected location':checkInFeedback[idOf(selected)]?.status==='checking'?'Checking your location':selected.visit_verification_available?'Verify your detected visit at selected location':'Verify that I am at selected location'} accessibilityHint="Check in" accessibilityState={{disabled:Boolean(selected.active_check_in)||checkInFeedback[idOf(selected)]?.status==='checking',busy:checkInFeedback[idOf(selected)]?.status==='checking'}} disabled={Boolean(selected.active_check_in)||checkInFeedback[idOf(selected)]?.status==='checking'} style={[s.secondarySmall,s.selectedAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line},(selected.active_check_in||checkInFeedback[idOf(selected)]?.status==='checking')&&s.disabled]} onPress={() => void checkIn(selected)}>
                      <Text style={[s.secondaryText,{color:theme.accent}]}>{selected.active_check_in?'Checked in ✓':checkInFeedback[idOf(selected)]?.status==='checking'?'Checking location…':selected.visit_verification_available?'Verify visit':"I'm here"}</Text>
                    </Pressable>
                    <Pressable style={[s.secondarySmall,s.selectedAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={() => addToRoute(selected)}>
                      <Text style={[s.secondaryText,{color:theme.accent}]}>Add to route</Text>
                    </Pressable>
                  </View>
                  <View style={s.selectedMoreRow}>
                    <Pressable style={[s.selectedMoreAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={() => contributeKnowledge(selected)}>
                      <Text style={[s.selectedMoreText,{color:theme.accent}]}>I know this place</Text>
                    </Pressable>
                    <Pressable style={[s.selectedMoreAction,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={() => router.push(`/location/${idOf(selected)}`)}>
                      <Text style={[s.selectedMoreText,{color:theme.accent}]}>Full details →</Text>
                    </Pressable>
                  </View>
                  <CheckInStatus feedback={checkInFeedback[idOf(selected)]} onReview={() => router.push({pathname:'/location/[id]',params:{id:idOf(selected),review:'1'}})} />
                </ScrollView>
              </View>
            ) : null}
          </View>
          {visibleRows.length?(
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show ${visibleRows.length} nearby result${visibleRows.length===1?'':'s'}`}
              accessibilityHint="Jump to the first search result"
              onPress={()=>listRef.current?.scrollToIndex({index:0,animated:true,viewPosition:0})}
              style={[s.resultsHandoff,{backgroundColor:theme.surface,borderColor:theme.line}]}
            >
              <Text numberOfLines={1} style={[s.resultsHandoffText,{color:theme.ink}]}>
                {visibleRows.length} nearby · {radiusLabel(effectiveRadiusMeters)}{freshNearbyCount?` · ${freshNearbyCount} fresh`:''}{kleenestNearbyCount?` · ${kleenestNearbyCount} Kleenest`:''}
              </Text>
              <Text style={[s.resultsHandoffAction,{color:theme.accent}]}>Results ↓</Text>
            </Pressable>
          ):null}
          {mode === 'route' && routeGap != null ? (
            <View style={[s.routeCoverage,{backgroundColor:theme.surface,borderColor:theme.line}]}>
              <Text style={[s.routeCoverageTitle,{color:theme.ink}]}>Largest qualifying-restroom gap: ~{routeGap.toFixed(routeGap < 10 ? 1 : 0)} mi</Text>
              <Text style={[s.help,{color:theme.muted}]}>Based on current qualifying candidates along the route; opening hours and availability can change.</Text>
            </View>
          ) : null}
        </View>
      ) : null}

            {(message || (mode === 'nearby' && attemptedRadiiMeters.length > 1) || cached) ? (
              <View style={s.discoveryStatus}>
                {message ? <Text numberOfLines={3} accessibilityLiveRegion="polite" style={[s.message,{color:theme.muted}]}>{message}</Text> : null}
                {mode === 'nearby' && attemptedRadiiMeters.length > 1 ? (
                  <Text style={[s.provenance,{color:theme.muted}]}>
                    Requested {radiusLabel(radius)} · effective {radiusLabel(effectiveRadiusMeters)} · searched {attemptedRadiiMeters.map(radiusLabel).join(' → ')}
                  </Text>
                ) : null}
                {cached ? <Text style={[s.provenance,{color:theme.muted}]}>Offline continuity result — refresh for live qualification.</Text> : null}
              </View>
            ) : null}

            <SponsoredSlot surface="maps" context={{route_context:mode,amenities:selectedAmenityNames}} contextClass="maps_between_results"/>

            <View style={s.listHeading}>
              <View>
                <Text style={[s.listEyebrow,{color:theme.accent}]}>{mode === 'route' ? 'ALONG YOUR ROUTE' : 'NEARBY OPTIONS'}</Text>
                <Text style={[s.listTitle,{color:theme.ink}]}>{mode === 'route' ? 'Bathrooms ahead' : 'Nearby businesses & bathrooms'}</Text>
              </View>
              <Text style={[s.listNote,{color:theme.muted}]}>{activeFilterCount?filterSummary:(cached ? 'Cached · pull to refresh' : 'Everything · distance + actions')}</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[s.resultItem,{backgroundColor:theme.surface,borderColor:theme.line}]}>
            <ResultCard
              item={item}
              selected={idOf(item) === selectedId}
              onSelect={() => selectRow(item)}
              onDirections={() => void directions(item)}
              onCheckIn={() => void checkIn(item)}
              onAddToRoute={() => addToRoute(item)}
              onKnow={() => contributeKnowledge(item)}
              onDetails={() => router.push(`/location/${idOf(item)}`)}
              onReview={() => router.push({pathname:'/location/[id]',params:{id:idOf(item),review:'1'}})}
              route={mode === 'route' ? route : null}
              requestedAmenities={selectedAmenityNames}
              checkInFeedback={checkInFeedback[idOf(item)]}
            />
          </View>
        )}
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
              <Text style={s.listEyebrow}>MISSING A PLACE?</Text>
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
  safe: { flex: 1, backgroundColor: palette.canvas },
  pageScroll: { flex: 1 },
  exploreCanvas:{position:'relative'},
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
  searchPanel:{position:'relative',marginHorizontal:10,zIndex:60,elevation:20,paddingHorizontal:9,paddingTop:7,paddingBottom:7,gap:5,borderRadius:15,borderWidth:1},
  searchAreaChip:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,backgroundColor:'#e8f1eb',borderRadius:11,paddingHorizontal:10,paddingVertical:7},
  searchAreaText:{flex:1,fontSize:10,fontWeight:'900',color:palette.green},searchAreaAction:{fontSize:9,fontWeight:'900',color:palette.green,textDecorationLine:'underline'},
  segment: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: '#e8efea' },
  segmentButton: { flex: 1, minHeight: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: palette.green },
  segmentText: { fontSize: 10, fontWeight: '900', color: palette.green },
  segmentTextActive: { color: '#fff' },
  searchRow: { flexDirection: 'row', gap: 7 },
  input: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: '#d6e2da',
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 11,
    fontSize: 13,
    color: palette.ink,
  },
  searchButton: { minHeight: 40, borderRadius: 12, backgroundColor: palette.green, paddingHorizontal: 11, justifyContent: 'center' },
  searchButtonText: { fontSize: 9, fontWeight: '900', color: '#fff' },
  rowHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  autoLabel: { fontSize: 9, fontWeight: '800', color: '#5f7468' },
  filterTitle: { fontSize: 10, fontWeight: '900', color: palette.green },
  inlineBlock: { gap: 5 },
  choiceRow: { flexDirection: 'row', gap: 6, paddingRight: 8 },
  choice: { minHeight: 32, paddingHorizontal: 9, borderRadius: 999, backgroundColor: '#e8efea', justifyContent: 'center' },
  choiceActive: { backgroundColor: palette.green },
  choiceText: { fontSize: 9, fontWeight: '900', color: '#52675a' },
  choiceTextActive: { color: '#fff' },
  linkText: { fontSize: 9, fontWeight: '900', color: palette.green, textDecorationLine: 'underline' },
  amenityHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  amenityTitle: { fontSize: 10, fontWeight: '900', color: palette.green },
  clear: { fontSize: 9, fontWeight: '900', color: '#567060' },
  amenityRow: { gap: 6, paddingRight: 8 },
  amenityPill: { minHeight: 32, paddingHorizontal: 9, borderRadius: 999, backgroundColor: '#eef3ef', justifyContent: 'center' },
  amenityPillActive: { backgroundColor: palette.green },
  amenityText: { fontSize: 9, fontWeight: '800', color: '#52675a' },
  amenityTextActive: { color: '#fff' },
  ruleRow: { flexDirection: 'row', gap: 6 },
  rule: { minHeight: 36, borderRadius: 10, backgroundColor: '#e8efea', paddingHorizontal: 10, justifyContent: 'center' },
  ruleActive: { backgroundColor: palette.green },
  ruleText: { fontSize: 9, fontWeight: '900', color: palette.green },
  ruleTextActive: { color: '#fff' },
  disabled: { opacity: 0.45 },
  message: { fontSize: 9, lineHeight: 14, color: '#66776d', fontWeight: '700' },
  provenance: { fontSize: 8, lineHeight: 12, color: '#718077', fontWeight: '700' },
  discoveryStatus:{paddingHorizontal:12,paddingVertical:8,gap:4},
  help: { fontSize: 10, lineHeight: 15, color: '#5f7468' },
  mapSection:{paddingHorizontal:0,gap:0,position:'relative',marginTop:8},
  mapFrame: {
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
  marker: { minWidth: 44, minHeight: 44, borderRadius: 22, backgroundColor: 'transparent', borderWidth: 0, alignItems: 'center', justifyContent: 'center', padding: 2 },
  markerActive: { transform: [{ scale: 1.08 }] },
  markerPhoto:{width:34,height:34,borderRadius:17,backgroundColor:'#e7eee9'},
  markerPhotoActive:{width:42,height:42,borderRadius:21},
  mapControls: { position: 'absolute', right: 10, zIndex:54, elevation:18, gap: 6 },
  mapControl: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.97)', borderWidth: 1, borderColor: '#cbd9d0', alignItems: 'center', justifyContent: 'center' },
  mapControlText: { fontSize: 19, fontWeight: '900', color: palette.green },
  searchThisArea:{position:'absolute',left:92,right:58,zIndex:52,elevation:16,minHeight:38,borderRadius:999,borderWidth:1,alignItems:'center',justifyContent:'center',paddingHorizontal:12},
  searchThisAreaText:{fontSize:10,fontWeight:'900'},
  legendWrap: { position: 'absolute', left: 10, right: 56, zIndex:48 },
  resultsHandoff:{minHeight:38,borderTopWidth:1,borderBottomWidth:1,paddingHorizontal:14,paddingVertical:7,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  resultsHandoffText:{flex:1,fontSize:10,fontWeight:'900'},
  resultsHandoffAction:{fontSize:10,fontWeight:'900'},
  selectedPanel: { position: 'absolute', left: 9, right: 54, bottom: 9, height: 228, zIndex: 40, elevation: 12, borderRadius: 16, padding: 9, backgroundColor: 'rgba(255,255,255,.97)', borderWidth: 1, borderColor: '#cfe0d5', gap: 4, overflow:'hidden' },
  selectedBodyScroll:{flex:1},
  selectedBodyContent:{gap:4,paddingBottom:0},
  selectedHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  selectedLabel: { flex: 1, fontSize: 8, fontWeight: '900', letterSpacing: 0.8, color: palette.green },
  close: { minWidth: 38, minHeight: 38, zIndex: 41, elevation: 13, borderRadius: 19, backgroundColor: palette.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 8 },
  closeText: { color: '#fff', fontSize: 20, lineHeight: 22, fontWeight: '900' },
  closeLabel: { color: '#fff', fontSize: 9, fontWeight: '900' },
  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  selectedPhoto:{width:48,height:48,borderRadius:12,backgroundColor:'#e7eee9'},
  selectedTitle: { fontSize: 14, fontWeight: '900', color: palette.ink },
  selectedDecisionMeta:{fontSize:8,lineHeight:12,fontWeight:'900'},
  actionRow: { flexDirection: 'row', gap: 6 },
  selectedAction: { flex: 1, alignItems: 'center' },
  selectedMoreRow:{flexDirection:'row',gap:6},
  selectedMoreAction:{flex:1,minHeight:27,borderWidth:1,borderRadius:9,alignItems:'center',justifyContent:'center',paddingHorizontal:8},
  selectedMoreText:{fontSize:8,fontWeight:'900'},
  primarySmall: { minHeight: 30, borderRadius: 9, backgroundColor: palette.green, paddingHorizontal: 9, paddingVertical: 6, justifyContent: 'center' },
  secondarySmall: { minHeight: 30, borderRadius: 9, backgroundColor: '#e8efea', paddingHorizontal: 9, paddingVertical: 6, justifyContent: 'center' },
  primaryText: { fontSize: 9, fontWeight: '900', color: '#fff' },
  secondaryText: { fontSize: 9, fontWeight: '900', color: palette.green },
  filterLauncher:{minHeight:40,borderRadius:12,borderWidth:1,borderColor:'#cbd9d0',backgroundColor:'#fff',paddingHorizontal:10,paddingVertical:6,flexDirection:'row',alignItems:'center',gap:8},
  filterLauncherMain:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:7},
  filterLauncherKicker:{fontSize:7,fontWeight:'900',letterSpacing:.8,color:palette.green},
  filterLauncherTitle:{flex:1,fontSize:11,fontWeight:'900',color:palette.ink},
  filterLauncherBadge:{maxWidth:'38%',backgroundColor:'#e8f1eb',borderRadius:999,paddingHorizontal:9,paddingVertical:6},
  filterLauncherBadgeText:{fontSize:8,fontWeight:'900',color:palette.green},
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
  advancedModalCard: { maxHeight: '82%', borderRadius: 20, backgroundColor: '#fff', padding: 14, gap: 12 },
  advancedModalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  advancedModalTitle: { fontSize: 18, lineHeight: 22, fontWeight: '900', color: palette.ink },
  advancedModalScroll: { flexGrow: 0 },
  advancedModalContent: { gap: 12, paddingBottom: 4 },
  modalClose: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.green, alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { color: '#fff', fontSize: 22, lineHeight: 24, fontWeight: '900' },
  modalDone: { minHeight: 40, borderRadius: 11, backgroundColor: palette.green, alignItems: 'center', justifyContent: 'center' },
  routeCoverage: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#fff7e8', borderWidth: 1, borderColor: '#ead9b4' },
  routeCoverageTitle: { fontSize: 10, fontWeight: '900', color: palette.ink },
  list: { paddingHorizontal: 14, paddingBottom: 34, gap: 8 },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 8 },
  resultItem: { paddingHorizontal: 14, paddingBottom: 8 },
  listFooter: { paddingHorizontal: 14, paddingBottom: 34 },
  listEyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8, color: palette.green },
  listTitle: { fontSize: 17, fontWeight: '900', color: palette.ink },
  listNote: { fontSize: 8, fontWeight: '800', color: '#718077' },
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
  cardTitle: { fontSize: 15, fontWeight: '900', color: palette.ink, flexShrink:1 },
  recommendedBadge:{borderWidth:1,borderRadius:999,paddingHorizontal:7,paddingVertical:3},
  recommendedBadgeText:{fontSize:7,fontWeight:'900',letterSpacing:0.7},
  recommendedReason:{fontSize:8,lineHeight:12,fontWeight:'800'},
  meta: { fontSize: 9, lineHeight: 13, color: '#66776d' },
  distance: { fontSize: 9, fontWeight: '900', color: palette.green },
  routeLine: { fontSize: 10, fontWeight: '900', color: '#365445' },
  trustSummaryRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  trustLine: { flex:1,fontSize: 9, lineHeight: 13, color: '#52675b', fontWeight: '700' },
  trustWhy:{fontSize:8,fontWeight:'900',textDecorationLine:'underline'},
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
