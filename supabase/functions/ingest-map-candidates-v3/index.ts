import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const AMENITY_QUERIES: Record<string, string[]> = {
  restroom: ['nwr["amenity"="toilets"]', 'nwr["building"="toilets"]', 'nwr["toilets"="yes"]', 'nwr["toilets:access"="public"]'],
  accessible_restroom: ['nwr["amenity"="toilets"]["wheelchair"="yes"]', 'nwr["toilets:wheelchair"="yes"]'],
  wheelchair: ['nwr["wheelchair"="yes"]'],
  drinking_water: ['nwr["amenity"="drinking_water"]', 'nwr["drinking_water"="yes"]'],
  baby_changing: ['nwr["changing_table"="yes"]', 'nwr["amenity"="toilets"]["changing_table"="yes"]'],
  shower: ['nwr["amenity"="shower"]', 'nwr["shower"="yes"]'],
  handwashing: ['nwr["handwashing"="yes"]'],
  seating: ['nwr["amenity"="bench"]', 'nwr["seats"]'],
  parking: ['nwr["amenity"="parking"]'],
  ev_charging: ['nwr["amenity"="charging_station"]', 'nwr["amenity"="fuel"]["fuel:electricity"="yes"]'],
  wifi: ['nwr["internet_access"="wlan"]', 'nwr["internet_access"="yes"]'],
  atm: ['nwr["amenity"="atm"]'],
};
const LABELS: Record<string, string> = {
  restroom: "Restroom",
  accessible_restroom: "Accessible restroom",
  wheelchair: "Wheelchair accessible",
  drinking_water: "Drinking water",
  baby_changing: "Baby changing",
  shower: "Shower",
  handwashing: "Handwashing",
  seating: "Seating",
  parking: "Parking",
  ev_charging: "EV charging",
  wifi: "Wi-Fi",
  atm: "ATM",
};

function category(tags: any) {
  if (tags.amenity === "toilets" || tags.building === "toilets" || tags.toilets === "yes" || tags["toilets:access"] === "public") return "restroom";
  if (tags.amenity === "fuel") return "gas_station";
  if (["restaurant", "fast_food"].includes(tags.amenity)) return "restaurant";
  if (tags.amenity === "cafe") return "cafe";
  if (["hospital", "clinic", "doctors", "dentist", "pharmacy"].includes(tags.amenity)) return "health";
  if (["park", "nature_reserve", "playground", "sports_centre"].includes(tags.leisure)) return "park";
  if (["supermarket", "convenience", "mall", "department_store", "bakery", "pharmacy"].includes(tags.shop)) return "shopping";
  if (["townhall", "courthouse", "police", "fire_station"].includes(tags.amenity) || tags.office === "government") return "public_safety";
  return "service";
}

function amenities(tags: any) {
  const result: Record<string, boolean> = {};
  const yes = (value: unknown) => ["yes", "true", "public", "customers", "accessible"].includes(String(value ?? "").toLowerCase());
  if (tags.amenity === "toilets" || tags.building === "toilets" || yes(tags.toilets) || tags["toilets:access"] === "public") result.restroom = true;
  if (tags.wheelchair === "yes" || tags["toilets:wheelchair"] === "yes") result.wheelchair = true;
  if (tags.amenity === "drinking_water" || yes(tags.drinking_water)) result.drinking_water = true;
  if (yes(tags.changing_table) || tags.amenity === "changing_table") result.baby_changing = true;
  if (tags.amenity === "shower" || yes(tags.shower)) result.shower = true;
  if (yes(tags.handwashing)) result.handwashing = true;
  if (tags.amenity === "bench" || tags.seats != null) result.seating = true;
  if (tags.amenity === "parking") result.parking = true;
  if (tags.amenity === "charging_station" || tags["fuel:electricity"] === "yes") result.ev_charging = true;
  if (["wlan", "yes"].includes(String(tags.internet_access ?? "").toLowerCase())) result.wifi = true;
  if (tags.amenity === "atm") result.atm = true;
  if (result.restroom && result.wheelchair) result.accessible_restroom = true;
  return result;
}

function rows(elements: any[]) {
  const capturedAt = new Date().toISOString();
  return elements.map(element => {
    const tags = element.tags || {};
    const latitude = Number(element.lat ?? element.center?.lat);
    const longitude = Number(element.lon ?? element.center?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const placeCategory = category(tags);
    const id = `osm:${element.type}:${element.id}`;
    const placeAmenities = amenities(tags);
    const amenityLabels = Object.keys(placeAmenities).map(key => LABELS[key] || key);
    const address = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ") || tags["addr:full"] || tags["addr:place"] || "";
    const phone = tags.phone || tags["contact:phone"] || "";
    const website = tags.website || tags["contact:website"] || "";
    const openingHours = tags.opening_hours || "";
    return {
      id,
      location_id: id,
      source_id: id,
      latitude,
      longitude,
      name: tags.name || tags.brand || tags.operator || (placeCategory === "restroom" ? "Public Restroom" : `Unnamed ${placeCategory.replaceAll("_", " ")}`),
      category: placeCategory,
      place_type: placeCategory,
      address,
      city: tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || "",
      state: tags["addr:state"] || "",
      postal_code: tags["addr:postcode"] || "",
      country: tags["addr:country"] || "",
      phone,
      website,
      opening_hours: openingHours,
      brand: tags.brand || null,
      operator_name: tags.operator || null,
      source: "osm",
      source_dataset: "openstreetmap_live",
      source_external_id: id,
      osm_tags: tags,
      amenities: placeAmenities,
      amenity_labels: amenityLabels,
      source_metadata: {
        tags,
        amenities: placeAmenities,
        amenity_labels: amenityLabels,
        opening_hours: openingHours,
        phone,
        website,
        captured_at: capturedAt,
        provider: "overpass",
        source_dataset: "openstreetmap_live",
      },
      is_verified: false,
    };
  }).filter(Boolean);
}

function baseQueries(latitude: number, longitude: number, radiusMeters: number) {
  const dlat = radiusMeters / 111320;
  const dlng = radiusMeters / (111320 * Math.max(Math.cos(latitude * Math.PI / 180), .2));
  const bbox = `(${latitude - dlat},${longitude - dlng},${latitude + dlat},${longitude + dlng})`;
  return [
    `nwr[amenity~"restaurant|fast_food|cafe|fuel|toilets|hospital|clinic|doctors|dentist|pharmacy|library|bus_station|townhall|courthouse|police|fire_station"]${bbox}`,
    `nwr[building="toilets"]${bbox}`,
    `nwr[toilets="yes"]${bbox}`,
    `nwr["toilets:access"="public"]${bbox}`,
    `nwr[shop~"supermarket|convenience|mall|department_store|bakery|pharmacy"]${bbox}`,
    `nwr[leisure~"park|nature_reserve|playground|sports_centre"]${bbox}`,
    `nwr[railway="station"]${bbox}`,
    `nwr[tourism~"hotel|motel|hostel|museum|gallery"]${bbox}`,
  ];
}

function query(latitude: number, longitude: number, radiusMeters: number, requested: string[]) {
  const dlat = radiusMeters / 111320;
  const dlng = radiusMeters / (111320 * Math.max(Math.cos(latitude * Math.PI / 180), .2));
  const bbox = `(${latitude - dlat},${longitude - dlng},${latitude + dlat},${longitude + dlng})`;
  const selected = [...new Set([
    ...baseQueries(latitude, longitude, radiusMeters),
    ...requested.flatMap(name => AMENITY_QUERIES[name] || []),
  ])];
  const clauses = selected.map(clause => clause.includes("(") ? clause : `${clause}${bbox}`);
  return `[out:json][timeout:15];(${clauses.join(";")};);out center tags;`;
}

async function one(endpoint: string, overpassQuery: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 16000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "text/plain", "user-agent": "KleenestApp/1.0" },
      body: overpassQuery,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload.elements) ? payload.elements : [];
  } finally {
    clearTimeout(timer);
  }
}

async function live(overpassQuery: string) {
  const results = await Promise.allSettled(ENDPOINTS.map(endpoint => one(endpoint, overpassQuery)));
  const successes = results.filter((result): result is PromiseFulfilledResult<any[]> => result.status === "fulfilled");
  const failures = results.map((result, index) => {
    if (result.status !== "rejected") return null;
    console.warn("ingest-map-candidates-v3 provider failure", ENDPOINTS[index], result.reason instanceof Error ? result.reason.message : "unknown");
    return { endpoint: ENDPOINTS[index], code: "PROVIDER_REQUEST_FAILED" };
  }).filter(Boolean);
  if (!successes.length) return { ok: false as const, elements: [], providers_succeeded: 0, providers_attempted: ENDPOINTS.length, failures };
  const seen = new Set<string>();
  const merged = successes.flatMap(result => result.value).filter(element => {
    const id = `${element.type}:${element.id}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { ok: true as const, elements: merged, providers_succeeded: successes.length, providers_attempted: ENDPOINTS.length, failures };
}

async function persist(locations: any[]) {
  if (!locations.length) return { ok: true, imported_locations: 0, updated_locations: 0, skipped_rows: 0, errors: [] };
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return { ok: false, deferred: true, code: "CANONICAL_PERSISTENCE_DEFERRED" };
  let imported = 0, updated = 0, skipped = 0, rowErrors = 0;
  try {
    for (let i = 0; i < locations.length; i += 500) {
      const response = await fetch(`${url}/rest/v1/rpc/ingest_external_locations`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_source_key: "osm", p_rows: locations.slice(i, i + 500) }),
      });
      const text = await response.text();
      if (!response.ok) {
        console.error("ingest-map-candidates-v3 persistence failure", response.status, text.slice(0, 500));
        return { ok: false, deferred: true, status: response.status, code: "CANONICAL_PERSISTENCE_DEFERRED" };
      }
      const result = text ? JSON.parse(text) : {};
      imported += Number(result.imported_locations || 0);
      updated += Number(result.updated_locations || 0);
      skipped += Number(result.skipped_rows || 0);
      if (Array.isArray(result.errors)) rowErrors += result.errors.length;
    }
    return { ok: true, imported_locations: imported, updated_locations: updated, skipped_rows: skipped, row_errors_count: rowErrors };
  } catch (error) {
    console.error("ingest-map-candidates-v3 persistence exception", error instanceof Error ? error.message : "unknown");
    return { ok: false, deferred: true, code: "CANONICAL_PERSISTENCE_DEFERRED" };
  }
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } }, 405);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: { code: "INVALID_JSON", message: "JSON body required" } }, 400);
  }

  const latitude = Number(body.latitude ?? body.lat);
  const longitude = Number(body.longitude ?? body.lng);
  const radiusKm = Math.min(Math.max(Number(body.radius_km || 8), 1), 40.234);
  const requested = Array.isArray(body.amenity_names)
    ? [...new Set(body.amenity_names.map((value: unknown) => String(value).trim().toLowerCase()).filter((value: string) => value in AMENITY_QUERIES))]
    : [];
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return json({ ok: false, error: { code: "INVALID_COORDINATES", message: "valid lat/lng required" } }, 400);
  }

  const acquired = await live(query(latitude, longitude, radiusKm * 1000, requested));
  if (!acquired.ok) {
    return json({
      ok: true,
      degraded: true,
      contract: "interactive-discovery-plus-canonical-persistence",
      acquisition_status: "provider_unavailable",
      canonical_fallback: true,
      retryable: true,
      warning: {
        code: "LIVE_DISCOVERY_UNAVAILABLE",
        stage: "acquisition",
        message: "Live discovery providers are temporarily unavailable. Use canonical nearby results and retry live discovery later.",
      },
      providers_succeeded: 0,
      providers_attempted: acquired.providers_attempted,
      provider_failures: acquired.failures,
      discovered: 0,
      radius_km: radiusKm,
      amenity_names: requested,
      persistence: { skipped: true, reason: "no_live_rows" },
      locations: [],
    });
  }

  const allLocations = rows(acquired.elements);
  const visibleLocations = requested.length
    ? allLocations.filter((row: any) => requested.every(name => Boolean(row.amenities?.[name])))
    : allLocations;
  const shouldPersist = body.collect !== false;
  const persistence = shouldPersist ? await persist(allLocations) : { ok: true, skipped: true };
  const persistenceWarning = shouldPersist && persistence.ok === false
    ? { code: "PERSISTENCE_DEFERRED", stage: "persistence", message: "Live places are available, but canonical persistence was deferred. The map can continue using the live result." }
    : null;

  return json({
    ok: true,
    degraded: Boolean(persistenceWarning),
    contract: "interactive-discovery-plus-canonical-persistence",
    canonical_persistence: shouldPersist ? (persistence.ok ? "ingest_external_locations" : "deferred") : "skipped",
    acquisition_status: visibleLocations.length ? "success" : "empty",
    cached: false,
    discovered: visibleLocations.length,
    canonical_candidates_discovered: allLocations.length,
    radius_km: radiusKm,
    amenity_names: requested,
    providers_succeeded: acquired.providers_succeeded,
    providers_attempted: acquired.providers_attempted,
    provider_failures: acquired.failures,
    persistence,
    warning: persistenceWarning,
    locations: visibleLocations,
  });
});
