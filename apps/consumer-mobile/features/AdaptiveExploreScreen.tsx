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
  { label: '5 mi', meters: 8047 },
  { label: '10 mi', meters: 16093 },
  { label: '25 mi', meters: 40234 },
  { label: '50 mi', meters: 80467 },
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
const navigateUrl = (row: any) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${row.latitude},${row.longitude}`)}&travelmode=driving`;

function freshnessLabel(value: string | null | undefined) {
  if (!value) return 'Not recently verified';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Verification date unavailable';
  const days = Math.max(0, Math.round((Date.now() - timestamp) / 86400000));
  return days === 0 ? 'Verified today' : `Verified ${days} day${days === 1 ? '' : 's'} ago`;
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

function ResultCard({ item, selected, onSelect, route }: {
  item: any;
  selected: boolean;
  onSelect: () => void;
  route: any;
}) {
  const fraction = Math.max(0, Math.min(1, Number(item.route_fraction || 0)));
  const ahead = route ? Math.max(0, Number(route.distanceMiles || 0) * fraction) : null;
  const eta = route ? Math.max(0, Number(route.durationMinutes || 0) * fraction) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${item.name || 'Restroom location'}, ${route && ahead != null ? `${ahead.toFixed(ahead < 10 ? 1 : 0)} miles ahead` : distanceLabel(item.distance_meters)}`}
      onPress={onSelect}
      style={[s.card, selected && s.cardActive]}
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
      <Text style={s.trustLine}>
        {freshnessLabel(item.trust?.latest_verified_at)}
        {item.trust?.amenity_evidence_count
          ? ` · ${item.trust.amenity_evidence_count} amenity evidence`
          : ''}
      </Text>
      <Text style={s.hint}>
        {selected ? 'Selected on map · Full details available' : 'Tap to preview this location on the map'}
      </Text>
    </Pressable>
  );
}

export default function AdaptiveExploreScreen() {
  const [mode, setMode] = useState<'nearby' | 'route'>('nearby');
  const [rows, setRows] = useState<any[]>([]);
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [mapZoom, setMapZoom] = useState(13);
  const [cameraNonce, setCameraNonce] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [radius, setRadius] = useState(8047);
  const [maxRadius, setMaxRadius] = useState(80467);
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
    setAttemptedRadiiMeters([]);
    setCached(false);
    setMessage(
      next === 'nearby'
        ? 'Search nearby bathrooms.'
        : 'Along route uses your saved route draft and current location.',
    );
  }

  function recenterMap() {
    if (!origin) return;
    setSelectedId('');
    setMapCenter(origin);
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
    });
    const point: [number, number] = [current.coords.longitude, current.coords.latitude];
    setOrigin(point);
    if (!selectedId) setMapCenter(point);
    return current;
  }

  async function loadNearby(clearQuery = false) {
    const current = await currentLocation();
    const nextOrigin: [number, number] = [current.coords.longitude, current.coords.latitude];
    const query = clearQuery ? '' : search.trim();
    if (clearQuery) setSearch('');
    let result: any;
    let usedMatureFallback = false;
    try {
      result = await findAdaptiveNearbyRestrooms({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        requestedRadiusMeters: radius,
        maxRadiusMeters: maxRadius,
        search: query,
        amenityNames: selectedAmenityNames,
        amenityMatch: matchRule,
        autoExpand,
        targetCount: 3,
        limit: 30,
      });
    } catch (error) {
      if (matchRule !== 'all') throw error;
      const legacyRows = await listNearbyRestrooms(
        current.coords.latitude,
        current.coords.longitude,
        radius,
        query,
        selectedAmenityNames,
      );
      result = {
        rows: legacyRows,
        requestedRadiusMeters: radius,
        effectiveRadiusMeters: radius,
        attemptedRadiiMeters: [radius],
        expanded: false,
      };
      usedMatureFallback = true;
    }

    const enriched = await enrich(result.rows);
    const preservedId = selectedId && enriched.some((row) => idOf(row) === selectedId)
      ? selectedId
      : '';
    setRows(enriched);
    setRoute(null);
    setOrigin(nextOrigin);
    if (!preservedId) setMapCenter(nextOrigin);
    setEffectiveRadiusMeters(result.effectiveRadiusMeters);
    setAttemptedRadiiMeters(result.attemptedRadiiMeters);
    setCached(false);
    setSelectedId(preservedId);

    captureConsumerDiscovery({
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
      radiusMeters: result.effectiveRadiusMeters,
      resultCount: enriched.length,
      search: query,
      amenityCount: selectedAmenityNames.length,
    });

    if (!query && !selectedAmenityNames.length && !result.expanded && enriched.length) {
      void writeNearbyCache(enriched, {
        selectedId: preservedId,
        origin: nextOrigin,
        radiusMeters: radius,
      });
    }

    if (usedMatureFallback) {
      setMessage(
        enriched.length
          ? `${enriched.length} nearby bathroom${enriched.length === 1 ? '' : 's'} found using the proven nearby search path while adaptive discovery recovers.`
          : 'No bathrooms matched the current nearby search.',
      );
    } else if (result.expanded) {
      setMessage(
        enriched.length
          ? `No sufficient match set within ${radiusLabel(result.requestedRadiusMeters)}. Expanded through ${result.attemptedRadiiMeters.map(radiusLabel).join(' → ')} and found ${enriched.length} qualifying location${enriched.length === 1 ? '' : 's'}.`
          : `No qualifying locations found after expanding through ${radiusLabel(result.effectiveRadiusMeters)}.`,
      );
    } else {
      setMessage(
        enriched.length
          ? `${enriched.length} qualifying bathroom${enriched.length === 1 ? '' : 's'} within ${radiusLabel(result.effectiveRadiusMeters)}.`
          : `No qualifying bathrooms found within ${radiusLabel(result.effectiveRadiusMeters)}.`,
      );
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

  async function load(options: { clearQuery?: boolean } = {}) {
    if (loading) return;
    setLoading(true);
    setMessage(mode === 'nearby' ? 'Searching nearby…' : 'Building route and searching its corridor…');
    try {
      if (mode === 'nearby') await loadNearby(Boolean(options.clearQuery));
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
        if (active) void load();
      });
    return () => { active = false; };
  }, []);

  const cameraViewState: any = routeBounds
    ? { bounds: routeBounds, padding: { top: 28, right: 28, bottom: 28, left: 28 } }
    : { center: mapCenter || origin || [0, 0], zoom: mapZoom };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.hero}>
        <View style={s.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>DISCOVER</Text>
            <Text style={s.title}>Find a trusted bathroom.</Text>
            <Text style={s.heroBody}>Nearby when you need one now. Along your route when you are planning ahead.</Text>
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
        <View style={s.segment}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'nearby' }}
            onPress={() => chooseMode('nearby')}
            style={[s.segmentButton, mode === 'nearby' && s.segmentActive]}
          >
            <Text style={[s.segmentText, mode === 'nearby' && s.segmentTextActive]}>Nearby</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'route' }}
            onPress={() => chooseMode('route')}
            style={[s.segmentButton, mode === 'route' && s.segmentActive]}
          >
            <Text style={[s.segmentText, mode === 'route' && s.segmentTextActive]}>Along route</Text>
          </Pressable>
        </View>

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

        {mode === 'nearby' ? (
          <>
            <View style={s.rowHeading}>
              <Text style={s.filterTitle}>Starting radius</Text>
              <View style={s.autoRow}>
                <Text style={s.autoLabel}>Expand automatically</Text>
                <Switch value={autoExpand} onValueChange={setAutoExpand} />
              </View>
            </View>
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
            {autoExpand ? (
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
              <Pressable onPress={() => router.push('/route')}>
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

        <View style={s.ruleRow}>
          <Pressable
            disabled={!selectedAmenityNames.length}
            onPress={() => setMatchRule('all')}
            style={[s.rule, matchRule === 'all' && s.ruleActive, !selectedAmenityNames.length && s.disabled]}
          >
            <Text style={[s.ruleText, matchRule === 'all' && s.ruleTextActive]}>Must include all</Text>
          </Pressable>
          <Pressable
            disabled={!selectedAmenityNames.length}
            onPress={() => setMatchRule('any')}
            style={[s.rule, matchRule === 'any' && s.ruleActive, !selectedAmenityNames.length && s.disabled]}
          >
            <Text style={[s.ruleText, matchRule === 'any' && s.ruleTextActive]}>Include any</Text>
          </Pressable>
        </View>

        {message ? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
        {mode === 'nearby' && attemptedRadiiMeters.length > 1 ? (
          <Text style={s.provenance}>
            Requested {radiusLabel(radius)} · effective {radiusLabel(effectiveRadiusMeters)} · searched {attemptedRadiiMeters.map(radiusLabel).join(' → ')}
          </Text>
        ) : null}
        {cached ? <Text style={s.provenance}>Offline continuity result — refresh for live qualification.</Text> : null}
      </View>

      {origin ? (
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
              <Marker id="kleenest-user-location" lngLat={origin} anchor="center">
                <View accessibilityLabel="Your current location" style={s.userLocationRing}>
                  <View style={s.userLocationDot} />
                </View>
              </Marker>
              {rows.filter(hasCoordinates).slice(0, 100).map((row) => {
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
              <Pressable accessibilityRole="button" accessibilityLabel="Center map on my location" style={s.mapControl} onPress={recenterMap}>
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
                  </Pressable>
                </View>
                <View style={s.selectedRow}>
                  <PlaceIcon item={selected} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={s.selectedTitle}>{selected.name || 'Restroom location'}</Text>
                    <Text numberOfLines={1} style={s.meta}>
                      {mode === 'route'
                        ? `${distanceLabel(selected.distance_to_route_meters)} from route`
                        : distanceLabel(selected.distance_meters)}
                      {' · '}{[selected.address, selected.city].filter(Boolean).join(', ') || 'Address unavailable'}
                    </Text>
                  </View>
                  <Pressable style={s.primarySmall} onPress={() => router.push(`/location/${idOf(selected)}`)}>
                    <Text style={s.primaryText}>Full details</Text>
                  </Pressable>
                </View>
                <RestroomSignals item={selected} compact />
                <View style={s.actionRow}>
                  <Pressable style={s.secondarySmall} onPress={() => addToRoute(selected)}>
                    <Text style={s.secondaryText}>Add to route</Text>
                  </Pressable>
                  <Pressable
                    style={s.primarySmall}
                    disabled={!hasCoordinates(selected)}
                    onPress={() => void directions(selected)}
                  >
                    <Text style={s.primaryText}>Start directions →</Text>
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

      <FlatList
        style={{ flex: 1 }}
        data={rows}
        scrollEnabled
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        keyExtractor={idOf}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <View style={s.listHeading}>
            <View>
              <Text style={s.listEyebrow}>{mode === 'route' ? 'ALONG YOUR ROUTE' : 'NEARBY OPTIONS'}</Text>
              <Text style={s.listTitle}>{mode === 'route' ? 'Bathrooms ahead' : 'Bathrooms near you'}</Text>
            </View>
            <Text style={s.listNote}>{cached ? 'Cached · pull to refresh' : 'Scroll results · map stays fixed'}</Text>
          </View>
        }
        ListFooterComponent={
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
        }
        renderItem={({ item }) => (
          <ResultCard
            item={item}
            selected={idOf(item) === selectedId}
            onSelect={() => selectRow(item)}
            route={mode === 'route' ? route : null}
          />
        )}
        ListEmptyComponent={!loading ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No qualifying results yet.</Text>
            <Text style={s.help}>
              {mode === 'nearby'
                ? 'Change the radius, amenity rule, or maximum distance and search again.'
                : 'Build or adjust your saved route, widen its corridor, or change amenity requirements.'}
            </Text>
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.canvas },
  hero: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: palette.green,
  },
  heroTop: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  eyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 1.5, color: '#bed4c6' },
  title: { fontSize: 19, lineHeight: 23, fontWeight: '900', color: '#fff', marginTop: 2 },
  heroBody: { fontSize: 10, lineHeight: 15, color: '#dfeae3', marginTop: 3 },
  locate: {
    minHeight: 44,
    minWidth: 62,
    borderRadius: 13,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  locateIcon: { fontSize: 16, fontWeight: '900', color: palette.green },
  locateText: { fontSize: 8, fontWeight: '900', color: palette.green },
  searchPanel: { paddingHorizontal: 14, paddingTop: 9, paddingBottom: 7, gap: 7 },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: '#e8efea' },
  segmentButton: { flex: 1, minHeight: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
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
  searchButton: { minHeight: 44, borderRadius: 12, backgroundColor: palette.green, paddingHorizontal: 12, justifyContent: 'center' },
  searchButtonText: { fontSize: 9, fontWeight: '900', color: '#fff' },
  rowHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  autoLabel: { fontSize: 9, fontWeight: '800', color: '#5f7468' },
  filterTitle: { fontSize: 10, fontWeight: '900', color: palette.green },
  inlineBlock: { gap: 5 },
  choiceRow: { flexDirection: 'row', gap: 6, paddingRight: 8 },
  choice: { minHeight: 38, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#e8efea', justifyContent: 'center' },
  choiceActive: { backgroundColor: palette.green },
  choiceText: { fontSize: 9, fontWeight: '900', color: '#52675a' },
  choiceTextActive: { color: '#fff' },
  linkText: { fontSize: 9, fontWeight: '900', color: palette.green, textDecorationLine: 'underline' },
  amenityHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  amenityTitle: { fontSize: 10, fontWeight: '900', color: palette.green },
  clear: { fontSize: 9, fontWeight: '900', color: '#567060' },
  amenityRow: { gap: 6, paddingRight: 8 },
  amenityPill: { minHeight: 38, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#eef3ef', justifyContent: 'center' },
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
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#eef4f0', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: palette.green, fontSize: 21, lineHeight: 23, fontWeight: '900' },
  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  selectedTitle: { fontSize: 14, fontWeight: '900', color: palette.ink },
  actionRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  primarySmall: { minHeight: 34, borderRadius: 9, backgroundColor: palette.green, paddingHorizontal: 9, paddingVertical: 7, justifyContent: 'center' },
  secondarySmall: { minHeight: 34, borderRadius: 9, backgroundColor: '#e8efea', paddingHorizontal: 9, paddingVertical: 7, justifyContent: 'center' },
  primaryText: { fontSize: 9, fontWeight: '900', color: '#fff' },
  secondaryText: { fontSize: 9, fontWeight: '900', color: palette.green },
  routeCoverage: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#fff7e8', borderWidth: 1, borderColor: '#ead9b4' },
  routeCoverageTitle: { fontSize: 10, fontWeight: '900', color: palette.ink },
  list: { paddingHorizontal: 14, paddingBottom: 34, gap: 8 },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8, paddingTop: 8, paddingBottom: 2 },
  listEyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8, color: palette.green },
  listTitle: { fontSize: 17, fontWeight: '900', color: palette.ink },
  listNote: { fontSize: 8, fontWeight: '800', color: '#718077' },
  card: { borderRadius: 16, padding: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce6df', gap: 6 },
  cardActive: { borderColor: palette.green, borderWidth: 2 },
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
