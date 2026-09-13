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
  type AmenityMatchRule,
} from '@kleenest/mobile-core';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { listAmenityCatalog, type AmenityCatalogItem } from '../services/amenities';
import { visitFreshness } from '../services/evidenceFormatting';
import { attachLocationTrust, listLocationTrustSummaries } from '../services/locationTrust';
import {
  cachedAgeLabel,
  readNearbyCache,
  readNearbyContinuity,
  writeNearbyCache,
  writeNearbyContinuity,
} from '../services/nearbyCache';
import { captureConsumerDiscovery, captureConsumerRouteIntent } from '../services/consumerTelemetry';
import {
  CompactRestroomSignals,
  MapLegend,
  PlaceIcon,
  RestroomSignals,
  restroomMarkerLabel,
} from '../components/RestroomSignals';
import { palette } from '../components/ConsumerUI';

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
const hasCoordinates = (row: any) =>
  Number.isFinite(Number(row?.latitude)) && Number.isFinite(Number(row?.longitude));
const miles = (meters: any) =>
  Number.isFinite(Number(meters)) ? Number(meters) / 1609.344 : null;
const distanceLabel = (meters: any) => {
  const value = miles(meters);
  if (value == null) return '—';
  return `${value.toFixed(value < 10 ? 1 : 0)} mi`;
};
const radiusLabel = (meters: number) => `${Math.round(meters / 1609.344)} mi`;
const looksLikeAddressOrArea = (value: string) => {
  const query=value.trim();
  return Boolean(query) && (/\d/.test(query) || /,/.test(query) || /\b\d{5}(?:-\d{4})?\b/.test(query) || /\s[A-Z]{2}$/i.test(query) || /\b(street|road|avenue|boulevard|drive|lane|highway|parkway|court|circle)\b/i.test(query));
};
const navigateUrl = (row: any) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${row.latitude},${row.longitude}`)}&travelmode=driving`;

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
  const matches = matchedRequestedAmenities(item, requested);
  if (!matches.length) return null;
  return (
    <View style={s.amenityMatchRow}>
      {!compact ? <Text style={s.amenityMatchLabel}>MATCHED</Text> : null}
      {matches.slice(0, compact ? 3 : 5).map((name) => (
        <View key={name} style={s.amenityMatchPill}>
          <Text style={s.amenityMatchText}>✓ {name}</Text>
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

function ResultCard({ item, selected, onSelect, onDirections, onAddToRoute, onDetails, route, requestedAmenities }: {
  item: any;
  selected: boolean;
  onSelect: () => void;
  onDirections: () => void;
  onAddToRoute: () => void;
  onDetails: () => void;
  route: any;
  requestedAmenities: string[];
}) {
  const fraction = Math.max(0, Math.min(1, Number(item.route_fraction || 0)));
  const ahead = route ? Math.max(0, Number(route.distanceMiles || 0) * fraction) : null;
  const eta = route ? Math.max(0, Number(route.durationMinutes || 0) * fraction) : null;
  const reviewCount = Number(item.review_count || 0);
  return (
    <View style={[s.card, selected && s.cardActive]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${item.name || 'Restroom location'}, ${route && ahead != null ? `${ahead.toFixed(ahead < 10 ? 1 : 0)} miles ahead` : distanceLabel(item.distance_meters)}`}
        onPress={onSelect}
        style={s.cardMain}
      >
        <View style={s.cardTop}>
          <PlaceIcon item={item} size={34} />
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{item.name || 'Restroom location'}</Text>
            {item.business_name ? <Text style={s.meta}>{item.business_name}</Text> : null}
            <Text style={s.meta}>
              {[item.address, item.city, item.state].filter(Boolean).join(', ') || 'Address unavailable'}
            </Text>
          </View>
          <Text style={s.distance}>
            {route && ahead != null
              ? `~${ahead.toFixed(ahead < 10 ? 1 : 0)} mi ahead`
              : distanceLabel(item.distance_meters)}
          </Text>
        </View>
        {route && eta != null ? (
          <Text style={s.routeLine}>
            ~{Math.round(eta)} min ahead · {distanceLabel(item.distance_to_route_meters)} from route
          </Text>
        ) : null}
        <RestroomSignals item={item} compact />
        <RequestedAmenityMatches item={item} requested={requestedAmenities} />
        {reviewCount > 0 ? <Text style={s.meta}>{reviewCount} review{reviewCount === 1 ? '' : 's'}</Text> : null}
        <Text style={s.trustLine}>{trustSummaryLine(item)}</Text>
        <Text style={s.hint}>
          {selected ? 'Selected on map' : 'Tap this card to focus its map pin'}
        </Text>
      </Pressable>
      <View style={s.cardActionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start directions to this location"
          disabled={!hasCoordinates(item)}
          style={[s.primarySmall, s.cardAction, !hasCoordinates(item) && s.disabled]}
          onPress={onDirections}
        >
          <Text style={s.primaryText}>Start navigation</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={[s.secondarySmall, s.cardAction]} onPress={onAddToRoute}>
          <Text style={s.secondaryText}>Add to route</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={[s.secondarySmall, s.cardAction]} onPress={onDetails}>
          <Text style={s.secondaryText}>Full details</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function AdaptiveExploreScreen() {
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
  const [radius, setRadius] = useState(8047);
  const [maxRadius, setMaxRadius] = useState(402336);
  const [effectiveRadiusMeters, setEffectiveRadiusMeters] = useState(8047);
  const [attemptedRadiiMeters, setAttemptedRadiiMeters] = useState<number[]>([]);
  const [autoExpand, setAutoExpand] = useState(true);
  const [matchRule, setMatchRule] = useState<AmenityMatchRule>('all');
  const [corridor, setCorridor] = useState(16093);
  const [amenities, setAmenities] = useState<AmenityCatalogItem[]>([]);
  const [selectedAmenityNames, setSelectedAmenityNames] = useState<string[]>([]);
  const [route, setRoute] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [cached, setCached] = useState(false);

  const selected = useMemo(
    () => rows.find((row) => idOf(row) === selectedId) || null,
    [rows, selectedId],
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
    if (!route || !rows.length) return null;
    const fractions = [
      0,
      ...rows
        .map((row) => Math.max(0, Math.min(1, Number(row.route_fraction || 0))))
        .sort((a, b) => a - b),
      1,
    ];
    let gap = 0;
    for (let index = 1; index < fractions.length; index += 1) {
      gap = Math.max(gap, fractions[index] - fractions[index - 1]);
    }
    return gap * Number(route.distanceMiles || 0);
  }, [route, rows]);

  function toggleAmenity(name: string) {
    setSelectedAmenityNames((current) =>
      current.includes(name)
        ? current.filter((value) => value !== name)
        : [...current, name],
    );
  }

  function selectRow(row: any) {
    const id = idOf(row);
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
    setMapCenter(target);
    setMapZoom(13);
    setCameraNonce((value) => value + 1);
  }

  function changeMapZoom(delta: number) {
    setMapZoom((current) => Math.min(18, Math.max(7, current + delta)));
    setCameraNonce((value) => value + 1);
  }

  async function enrich(data: any[]) {
    const ids = data.map(idOf).filter(Boolean);
    const summaries = ids.length
      ? await listLocationTrustSummaries(ids).catch(() => [])
      : [];
    return attachLocationTrust(data, summaries);
  }

  async function currentLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      throw new Error(
        'Location access is needed for restroom discovery. Enable it in phone settings and try again.',
      );
    }
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }).catch(async (freshLocationError) => {
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (!lastKnown) throw freshLocationError;
      return lastKnown;
    });
    const point: [number, number] = [current.coords.longitude, current.coords.latitude];
    setOrigin(point);
    if (!selectedId) setMapCenter(point);
    return current;
  }

  async function loadNearby(clearQuery = false, preserveCacheOnEmpty = false) {
    const rawQuery=clearQuery?'':search.trim();
    if(clearQuery){setSearch('');setSearchAreaOrigin(null);setSearchAreaLabel('');}

    let areaMatch:{origin:[number,number];label:string}|null=null;
    if(rawQuery&&looksLikeAddressOrArea(rawQuery)){
      const permission=await Location.requestForegroundPermissionsAsync();
      if(permission.status!=='granted')throw new Error('Location access is needed to search an address on this device. Enable it in phone settings and try again.');
      const geocoded=await Location.geocodeAsync(rawQuery);
      const match=geocoded.find(item=>Number.isFinite(item.latitude)&&Number.isFinite(item.longitude));
      if(!match)throw new Error(`Kleenest could not locate “${rawQuery}”. Try a fuller street address, city/state, or ZIP.`);
      areaMatch={origin:[match.longitude,match.latitude],label:rawQuery};
    }

    const current=areaMatch?null:await currentLocation();
    const nextOrigin:[number,number]=areaMatch?areaMatch.origin:[Number(current!.coords.longitude),Number(current!.coords.latitude)];
    const latitude=nextOrigin[1],longitude=nextOrigin[0];
    const query=areaMatch?'':rawQuery;
    if(areaMatch){setSearchAreaOrigin(areaMatch.origin);setSearchAreaLabel(areaMatch.label);}
    else if(rawQuery){setSearchAreaOrigin(null);setSearchAreaLabel('');}

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
        autoExpand: selectedAmenityNames.length > 0 && autoExpand,
        targetCount: 3,
        limit: 500,
      });
    } catch (error) {
      if (matchRule !== 'all') throw error;
      const legacyRows = await listNearbyRestrooms(latitude,longitude,radius,query,selectedAmenityNames);
      result = { rows: legacyRows, requestedRadiusMeters: radius, effectiveRadiusMeters: radius, attemptedRadiiMeters: [radius], expanded: false };
      usedMatureFallback = true;
    }

    const enriched = await enrich(result.rows);
    if (!areaMatch&&!enriched.length && preserveCacheOnEmpty && !query && !selectedAmenityNames.length) {
      const fallback = await readNearbyCache();
      if (fallback?.rows?.length) {
        const fallbackSelected = selectedId && fallback.rows.some((row: any) => idOf(row) === selectedId) ? selectedId : '';
        setRows(fallback.rows);setSelectedId(fallbackSelected);setRoute(null);
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

    if (!areaMatch&&!query && !selectedAmenityNames.length && !result.expanded && enriched.length) {
      void writeNearbyCache(enriched,{selectedId:preservedId,origin:nextOrigin,radiusMeters:radius});
    }

    if(areaMatch){
      setMessage(enriched.length
        ? `${enriched.length} bathroom${enriched.length===1?'':'s'} found while Searching near ${areaMatch.label} within ${radiusLabel(result.effectiveRadiusMeters)}${result.expanded?' after adaptive expansion':''}.`
        : `No qualifying bathrooms found while Searching near ${areaMatch.label} through ${radiusLabel(result.effectiveRadiusMeters)}.`);
    } else if (usedMatureFallback) {
      setMessage(enriched.length?`${enriched.length} nearby bathroom${enriched.length===1?'':'s'} found using the proven nearby search path while adaptive discovery recovers.`:'No bathrooms matched the current nearby search.');
    } else if (result.expanded) {
      setMessage(enriched.length?`No sufficient match set within ${radiusLabel(result.requestedRadiusMeters)}. Expanded through ${result.attemptedRadiiMeters.map(radiusLabel).join(' → ')} and found ${enriched.length} qualifying location${enriched.length===1?'':'s'}.`:`No qualifying locations found after expanding through ${radiusLabel(result.effectiveRadiusMeters)}.`);
    } else if (!query && !selectedAmenityNames.length) {
      setMessage(enriched.length?`${enriched.length} nearby places within ${radiusLabel(result.effectiveRadiusMeters)} · ${restroomEvidence} with restroom evidence · ${verificationCandidates} need bathroom verification.`:`No nearby places found within ${radiusLabel(result.effectiveRadiusMeters)}.`);
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
    const enriched = await enrich(data);
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

  async function load(options: { clearQuery?: boolean; preserveCacheOnEmpty?: boolean } = {}) {
    if (loading) return;
    setLoading(true);
    setMessage(mode === 'nearby' ? 'Searching nearby…' : 'Building route and searching its corridor…');
    try {
      if (mode === 'nearby') await loadNearby(
        Boolean(options.clearQuery),
        Boolean(options.preserveCacheOnEmpty),
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

  async function directions(row: any) {
    if (!hasCoordinates(row)) return;
    const id = idOf(row);
    if (id) captureConsumerRouteIntent(id);
    await Linking.openURL(navigateUrl(row));
  }

  useEffect(() => {
    listAmenityCatalog().then(setAmenities).catch(() => {});
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
          if (cache.origin) {
            setOrigin(cache.origin);
            setMapCenter(cache.origin);
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
    <SafeAreaView style={s.safe}>
      <FlatList
        style={s.pageScroll}
        data={rows}
        keyExtractor={idOf}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        ListHeaderComponent={
          <>
      <View style={s.hero}>
        <View style={s.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>DISCOVER</Text>
            <Text style={s.title}>Find a trusted bathroom.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Find bathrooms near my current location"
            style={s.locate}
            disabled={loading}
            onPress={() => {
              if (mode !== 'nearby') chooseMode('nearby');
              void load({ clearQuery: true });
            }}
          >
            <Text style={s.locateIcon}>⌖</Text>
            <Text style={s.locateText}>{loading ? 'Finding…' : 'Locate'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={s.searchPanel}>
        <View style={s.searchRow}>
          <TextInput
            accessibilityLabel="Search bathrooms"
            style={s.input}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => void load()}
            returnKeyType="search"
            placeholder="Search a place, address or brand"
            placeholderTextColor="#7b8b82"
          />
          <Pressable
            accessibilityRole="button"
            style={s.searchButton}
            disabled={loading}
            onPress={() => void load()}
          >
            <Text style={s.searchButtonText}>{loading ? 'WORKING…' : 'SEARCH'}</Text>
          </Pressable>
        </View>

        {searchAreaLabel?<View style={s.searchAreaChip}><Text style={s.searchAreaText}>Searching near {searchAreaLabel}</Text><Pressable onPress={()=>{setSearch('');setSearchAreaOrigin(null);setSearchAreaLabel('');void load({clearQuery:true});}}><Text style={s.searchAreaAction}>Use my location</Text></Pressable></View>:null}

        <View style={s.segment} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nearby search"
            accessibilityState={{ selected: mode === 'nearby' }}
            onPress={() => chooseMode('nearby')}
            style={[s.segmentButton, mode === 'nearby' && s.segmentActive]}
          >
            <Text style={[s.segmentText, mode === 'nearby' && s.segmentTextActive]}>Nearby</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Along route search"
            accessibilityState={{ selected: mode === 'route' }}
            onPress={() => chooseMode('route')}
            style={[s.segmentButton, mode === 'route' && s.segmentActive]}
          >
            <Text style={[s.segmentText, mode === 'route' && s.segmentTextActive]}>Along route</Text>
          </Pressable>
        </View>

        {mode === 'nearby' ? (
          <>
            <View style={s.rowHeading}>
              <Text style={s.filterTitle}>Starting radius</Text>
              <Text style={s.autoLabel}>Local search</Text>
            </View>
            <View accessibilityRole="radiogroup">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choiceRow}>
                {radiusChoices.map((choice) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: radius === choice.meters }}
                    key={choice.meters}
                    style={[s.choice, radius === choice.meters && s.choiceActive]}
                    onPress={() => chooseRadius(choice.meters)}
                  >
                    <Text style={[s.choiceText, radius === choice.meters && s.choiceTextActive]}>{choice.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </>
        ) : (
          <View style={s.rowHeading}>
            <Text style={s.filterTitle}>Along-route search</Text>
            <Text style={s.autoLabel}>Route controls are under advanced</Text>
          </View>
        )}

        <View style={s.amenityHeading}>
          <Text style={s.amenityTitle}>What matters on this stop?</Text>
          {selectedAmenityNames.length ? (
            <Pressable accessibilityRole="button" onPress={() => setSelectedAmenityNames([])}>
              <Text style={s.clear}>Clear filters</Text>
            </Pressable>
          ) : null}
        </View>
        {filterAmenities.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.amenityRow}>
            {filterAmenities.map((item) => (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selectedAmenityNames.includes(item.name) }}
                key={item.id}
                style={[
                  s.amenityPill,
                  selectedAmenityNames.includes(item.name) && s.amenityPillActive,
                ]}
                onPress={() => toggleAmenity(item.name)}
              >
                <Text style={[
                  s.amenityText,
                  selectedAmenityNames.includes(item.name) && s.amenityTextActive,
                ]}>{item.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Text style={s.help}>Amenity catalog is loading.</Text>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Advanced filters"
          accessibilityState={{ expanded: showAdvanced }}
          onPress={() => setShowAdvanced(true)}
          style={s.advancedButton}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.filterTitle}>Advanced filters</Text>
            <Text style={s.help}>Trip distance, corridor, and match rules</Text>
          </View>
          <Text style={s.linkText}>Open</Text>
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
              accessibilityLabel="Close advanced filters"
              style={StyleSheet.absoluteFill}
              onPress={() => setShowAdvanced(false)}
            />
            <View style={s.advancedModalCard}>
              <View style={s.advancedModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.advancedModalTitle}>Advanced filters</Text>
                  <Text style={s.help}>{mode === 'nearby' ? 'Tune required amenities and maximum search distance.' : 'Tune the route corridor and match rules.'}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close advanced filters"
                  style={s.modalClose}
                  onPress={() => setShowAdvanced(false)}
                >
                  <Text style={s.modalCloseText}>×</Text>
                </Pressable>
              </View>
              <ScrollView
                style={s.advancedModalScroll}
                contentContainerStyle={s.advancedModalContent}
                showsVerticalScrollIndicator={false}
              >
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
                      <View style={s.inlineBlock}>
                        <Text style={s.filterTitle}>Maximum distance</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choiceRow}>
                          {maxChoices.map((choice) => {
                            const enabledValue = Math.max(radius, choice.meters);
                            return (
                              <Pressable
                                key={choice.meters}
                                style={[s.choice, maxRadius === enabledValue && s.choiceActive]}
                                onPress={() => setMaxRadius(enabledValue)}
                              >
                                <Text style={[s.choiceText, maxRadius === enabledValue && s.choiceTextActive]}>{choice.label}</Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <View style={s.inlineBlock}>
                    <View style={s.rowHeading}>
                      <Text style={s.filterTitle}>Route corridor</Text>
                      <Pressable onPress={() => { setShowAdvanced(false); router.push('/route'); }}>
                        <Text style={s.linkText}>Open Route planner</Text>
                      </Pressable>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choiceRow}>
                      {corridorChoices.map((choice) => (
                        <Pressable
                          key={choice.meters}
                          style={[s.choice, corridor === choice.meters && s.choiceActive]}
                          onPress={() => setCorridor(choice.meters)}
                        >
                          <Text style={[s.choiceText, corridor === choice.meters && s.choiceTextActive]}>{choice.label}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {selectedAmenityNames.length ? (
                  <View style={s.ruleRow}>
                    <Pressable
                      onPress={() => setMatchRule('all')}
                      style={[s.rule, matchRule === 'all' && s.ruleActive]}
                    >
                      <Text style={[s.ruleText, matchRule === 'all' && s.ruleTextActive]}>Must include all</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setMatchRule('any')}
                      style={[s.rule, matchRule === 'any' && s.ruleActive]}
                    >
                      <Text style={[s.ruleText, matchRule === 'any' && s.ruleTextActive]}>Include any</Text>
                    </Pressable>
                  </View>
                ) : null}
              </ScrollView>
              <Pressable style={s.modalDone} onPress={() => setShowAdvanced(false)}>
                <Text style={s.primaryText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {message ? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
        {mode === 'nearby' && attemptedRadiiMeters.length > 1 ? (
          <Text style={s.provenance}>
            Requested {radiusLabel(radius)} · effective {radiusLabel(effectiveRadiusMeters)} · searched {attemptedRadiiMeters.map(radiusLabel).join(' → ')}
          </Text>
        ) : null}
        {cached ? <Text style={s.provenance}>Offline continuity result — refresh for live qualification.</Text> : null}
      </View>

      {(origin||searchAreaOrigin) ? (
        <View style={s.mapSection}>
          <View style={s.mapFrame}>
            <Map androidView="texture" style={s.map} mapStyle={OSM_STYLE}>
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
                <View accessibilityLabel="Your current location" style={s.userLocationRing}>
                  <View style={s.userLocationDot} />
                </View>
              </Marker>:null}
              {searchAreaOrigin?<Marker id="searched-area-marker" lngLat={searchAreaOrigin} anchor="center">
                <View accessibilityLabel={`Search area: ${searchAreaLabel}`} style={s.searchedAreaMarker}><Text style={s.searchedAreaMarkerText}>◎</Text></View>
              </Marker>:null}
              {rows.filter(hasCoordinates).map((row) => {
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
                      style={[s.marker, active && s.markerActive]}
                    >
                      <PlaceIcon item={row} size={active ? 28 : 22} />
                    </Pressable>
                  </Marker>
                );
              })}
            </Map>
            <View pointerEvents="none" style={s.mapBadge}>
              <Text style={s.mapBadgeText}>{cached ? 'Cached · ' : ''}{rows.length} results</Text>
            </View>
            <View style={s.mapControls}>
              <Pressable accessibilityRole="button" accessibilityLabel="Zoom map in" style={s.mapControl} onPress={() => changeMapZoom(1)}>
                <Text style={s.mapControlText}>＋</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Zoom map out" style={s.mapControl} onPress={() => changeMapZoom(-1)}>
                <Text style={s.mapControlText}>−</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={searchAreaOrigin?'Center map on searched area':'Center map on my location'} style={s.mapControl} onPress={recenterMap}>
                <Text style={s.mapControlText}>⌖</Text>
              </Pressable>
            </View>
            <View pointerEvents="box-none" style={s.legendWrap}>
              <MapLegend />
            </View>
            {selected ? (
              <View pointerEvents="box-none" style={s.selectedPanel}>
                <View style={s.selectedHead}>
                  <Text style={s.selectedLabel}>BEST NEXT DECISION</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close selected location"
                    hitSlop={8}
                    onPress={() => setSelectedId('')}
                    style={s.close}
                  >
                    <Text style={s.closeText}>×</Text>
                    <Text style={s.closeLabel}>Close</Text>
                  </Pressable>
                </View>
                <View style={s.selectedRow}>
                  <PlaceIcon item={selected} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={s.selectedTitle}>{selected.name || 'Restroom location'}</Text>
                    <Text numberOfLines={2} style={s.meta}>
                      {selectedRoutePosition || distanceLabel(selected.distance_meters)}
                      {' · '}{[selected.address, selected.city].filter(Boolean).join(', ') || 'Address unavailable'}
                    </Text>
                  </View>
                </View>
                <CompactRestroomSignals item={selected} />
                <RequestedAmenityMatches item={selected} requested={selectedAmenityNames} compact />
                <View style={s.actionRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Start directions to this location"
                    style={[s.primarySmall, s.selectedAction, !hasCoordinates(selected) && s.disabled]}
                    disabled={!hasCoordinates(selected)}
                    onPress={() => void directions(selected)}
                  >
                    <Text style={s.primaryText}>Start navigation</Text>
                  </Pressable>
                  <Pressable style={[s.secondarySmall, s.selectedAction]} onPress={() => addToRoute(selected)}>
                    <Text style={s.secondaryText}>Add to route</Text>
                  </Pressable>
                  <Pressable style={[s.secondarySmall, s.selectedAction]} onPress={() => router.push(`/location/${idOf(selected)}`)}>
                    <Text style={s.secondaryText}>Full details</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
          {mode === 'route' && routeGap != null ? (
            <View style={s.routeCoverage}>
              <Text style={s.routeCoverageTitle}>Largest qualifying-restroom gap: ~{routeGap.toFixed(routeGap < 10 ? 1 : 0)} mi</Text>
              <Text style={s.help}>Based on current qualifying candidates along the route; opening hours and availability can change.</Text>
            </View>
          ) : null}
        </View>
      ) : null}


            <View style={s.listHeading}>
              <View>
                <Text style={s.listEyebrow}>{mode === 'route' ? 'ALONG YOUR ROUTE' : 'NEARBY OPTIONS'}</Text>
                <Text style={s.listTitle}>{mode === 'route' ? 'Bathrooms ahead' : 'Nearby businesses & bathrooms'}</Text>
              </View>
              <Text style={s.listNote}>{cached ? 'Cached · pull to refresh' : 'Distance + actions on every card'}</Text>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <View style={s.resultItem}>
            <ResultCard
              item={item}
              selected={idOf(item) === selectedId}
              onSelect={() => selectRow(item)}
              onDirections={() => void directions(item)}
              onAddToRoute={() => addToRoute(item)}
              onDetails={() => router.push(`/location/${idOf(item)}`)}
              route={mode === 'route' ? route : null}
              requestedAmenities={selectedAmenityNames}
            />
          </View>
        )}
        ListEmptyComponent={!loading ? (
          <View style={s.resultItem}>
            <View style={s.empty}>
              <Text style={s.emptyTitle}>No qualifying results yet.</Text>
              <Text style={s.help}>
                {mode === 'nearby'
                  ? 'Change the radius, amenity rule, or maximum distance and search again.'
                  : 'Build or adjust your saved route, widen its corridor, or change amenity requirements.'}
              </Text>
            </View>
          </View>
        ) : null}
        ListFooterComponent={
          <View style={s.listFooter}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a missing bathroom"
              onPress={() => router.push('/discover')}
              style={s.missingPlace}
            >
              <Text style={s.listEyebrow}>MISSING A PLACE?</Text>
              <Text style={s.missingTitle}>Add a missing bathroom</Text>
              <Text style={s.help}>Contribute a place that is not in the Kleenest network yet.</Text>
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
  searchPanel: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 5, gap: 5 },
  searchAreaChip:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,backgroundColor:'#e8f1eb',borderRadius:11,paddingHorizontal:10,paddingVertical:7},
  searchAreaText:{flex:1,fontSize:10,fontWeight:'900',color:palette.green},searchAreaAction:{fontSize:9,fontWeight:'900',color:palette.green,textDecorationLine:'underline'},
  segment: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: '#e8efea' },
  segmentButton: { flex: 1, minHeight: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: palette.green },
  segmentText: { fontSize: 10, fontWeight: '900', color: palette.green },
  segmentTextActive: { color: '#fff' },
  searchRow: { flexDirection: 'row', gap: 7 },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#d6e2da',
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 11,
    fontSize: 13,
    color: palette.ink,
  },
  searchButton: { minHeight: 40, borderRadius: 12, backgroundColor: palette.green, paddingHorizontal: 12, justifyContent: 'center' },
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
  help: { fontSize: 10, lineHeight: 15, color: '#5f7468' },
  mapSection: { paddingHorizontal: 14, gap: 5 },
  mapFrame: {
    height: 230,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d4e0d8',
    backgroundColor: '#dde6e0',
    position: 'relative',
  },
  map: { flex: 1 },
  userLocationRing: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(32,106,69,.2)', alignItems: 'center', justifyContent: 'center' },
  userLocationDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.green, borderWidth: 2, borderColor: '#fff' },
  searchedAreaMarker:{width:30,height:30,borderRadius:15,backgroundColor:'#fff',borderWidth:3,borderColor:'#986c20',alignItems:'center',justifyContent:'center'},searchedAreaMarkerText:{fontSize:18,fontWeight:'900',color:'#986c20'},
  marker: { minWidth: 42, minHeight: 42, borderRadius: 21, backgroundColor: '#fff', borderWidth: 2, borderColor: palette.green, alignItems: 'center', justifyContent: 'center', padding: 4 },
  markerActive: { borderWidth: 4, transform: [{ scale: 1.1 }] },
  mapBadge: { position: 'absolute', top: 9, left: 9, borderRadius: 999, backgroundColor: 'rgba(23,61,43,.9)', paddingHorizontal: 9, paddingVertical: 6 },
  mapBadgeText: { fontSize: 8, fontWeight: '900', color: '#fff' },
  mapControls: { position: 'absolute', right: 9, top: 9, gap: 6 },
  mapControl: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.97)', borderWidth: 1, borderColor: '#cbd9d0', alignItems: 'center', justifyContent: 'center' },
  mapControlText: { fontSize: 19, fontWeight: '900', color: palette.green },
  legendWrap: { position: 'absolute', top: 50, left: 9, right: 54 },
  selectedPanel: { position: 'absolute', left: 9, right: 54, bottom: 9, borderRadius: 13, padding: 9, backgroundColor: 'rgba(255,255,255,.97)', borderWidth: 1, borderColor: '#cfe0d5', gap: 5 },
  selectedHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  selectedLabel: { flex: 1, fontSize: 8, fontWeight: '900', letterSpacing: 0.8, color: palette.green },
  close: { minHeight: 38, borderRadius: 19, backgroundColor: palette.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 10 },
  closeText: { color: '#fff', fontSize: 20, lineHeight: 22, fontWeight: '900' },
  closeLabel: { color: '#fff', fontSize: 9, fontWeight: '900' },
  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  selectedTitle: { fontSize: 14, fontWeight: '900', color: palette.ink },
  actionRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  selectedAction: { flexGrow: 1, alignItems: 'center' },
  primarySmall: { minHeight: 34, borderRadius: 9, backgroundColor: palette.green, paddingHorizontal: 9, paddingVertical: 7, justifyContent: 'center' },
  secondarySmall: { minHeight: 34, borderRadius: 9, backgroundColor: '#e8efea', paddingHorizontal: 9, paddingVertical: 7, justifyContent: 'center' },
  primaryText: { fontSize: 9, fontWeight: '900', color: '#fff' },
  secondaryText: { fontSize: 9, fontWeight: '900', color: palette.green },
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
  card: { borderRadius: 16, padding: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce6df', gap: 6 },
  cardActive: { borderColor: palette.green, borderWidth: 2 },
  cardMain: { gap: 6 },
  cardActionRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  cardAction: { flexGrow: 1, alignItems: 'center' },
  amenityMatchRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 2 },
  amenityMatchLabel: { fontSize: 7, fontWeight: '900', letterSpacing: 0.8, color: palette.green },
  amenityMatchPill: { borderRadius: 999, backgroundColor: '#e8f1eb', paddingHorizontal: 7, paddingVertical: 4 },
  amenityMatchText: { fontSize: 8, fontWeight: '900', color: palette.green },
  cardTop: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  cardTitle: { fontSize: 15, fontWeight: '900', color: palette.ink },
  meta: { fontSize: 9, lineHeight: 13, color: '#66776d' },
  distance: { fontSize: 9, fontWeight: '900', color: palette.green },
  routeLine: { fontSize: 10, fontWeight: '900', color: '#365445' },
  trustLine: { fontSize: 9, lineHeight: 13, color: '#52675b', fontWeight: '700' },
  hint: { fontSize: 8, color: '#718077' },
  missingPlace: { marginTop: 4, marginBottom: 12, borderRadius: 14, padding: 12, backgroundColor: '#eef4f0', borderWidth: 1, borderColor: '#d4e0d8' },
  missingTitle: { fontSize: 14, fontWeight: '900', color: palette.ink, marginTop: 2 },
  empty: { borderRadius: 16, padding: 14, backgroundColor: '#fff', gap: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '900', color: palette.ink },
});
