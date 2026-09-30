import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceKey);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function text(value: unknown) {
  return String(value ?? "").trim();
}

function placeholderAddress(value: unknown) {
  const address = text(value);
  return (
    !address ||
    /^[A-Z]{2}$/i.test(address) ||
    /^[A-Z]{2},\s*\d{5}(?:-\d{4})?,\s*[A-Z]{2}$/i.test(address)
  );
}

function regionCode(address: Record<string, unknown>) {
  const iso = text(address["ISO3166-2-lvl4"] || address["ISO3166-2-lvl3"]);
  const match = iso.match(/^[A-Z]{2}-([A-Z0-9]{1,3})$/i);
  return match ? match[1].toUpperCase() : text(address.state);
}

type ReverseResult = {
  provider: "nominatim" | "photon";
  display: string;
  houseNumber: string;
  road: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  raw: any;
  sourceUrl: string;
};

async function reverseLookup(latitude: number, longitude: number): Promise<ReverseResult> {
  const nominatimParams = new URLSearchParams({
    format: "jsonv2",
    lat: String(latitude),
    lon: String(longitude),
    addressdetails: "1",
    zoom: "18",
  });
  const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?${nominatimParams}`;
  const nominatimResponse = await fetch(nominatimUrl, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": "Kleenest/1.0 (https://matthagersenior.github.io/Kleenest_Production/)",
      Referer: "https://matthagersenior.github.io/Kleenest_Production/",
    },
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);

  if (nominatimResponse?.ok) {
    const geo = await nominatimResponse.json();
    const a = (geo?.address ?? {}) as Record<string, unknown>;
    return {
      provider: "nominatim",
      display: text(geo?.display_name),
      houseNumber: text(a.house_number),
      road: text(a.road || a.pedestrian || a.footway),
      city: text(a.city || a.town || a.village || a.municipality),
      state: regionCode(a),
      postalCode: text(a.postcode),
      country: text(a.country_code).toUpperCase(),
      raw: geo,
      sourceUrl: nominatimUrl,
    };
  }

  const photonParams = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    limit: "1",
    lang: "en",
  });
  const photonUrl = `https://photon.komoot.io/reverse?${photonParams}`;
  const photonResponse = await fetch(photonUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Kleenest/1.0 (https://matthagersenior.github.io/Kleenest_Production/)",
      Referer: "https://matthagersenior.github.io/Kleenest_Production/",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!photonResponse.ok) {
    throw new Error(
      `Reverse geocoders unavailable (Nominatim ${nominatimResponse?.status ?? "network"}, Photon ${photonResponse.status})`,
    );
  }
  const geo = await photonResponse.json();
  const feature = Array.isArray(geo?.features) ? geo.features[0] : null;
  const p = (feature?.properties ?? {}) as Record<string, unknown>;
  const display = [
    text(p.name),
    text([p.housenumber, p.street].filter(Boolean).join(" ")),
    text(p.city || p.locality || p.county),
    text(p.state),
    text(p.postcode),
    text(p.country),
  ].filter(Boolean).join(", ");
  return {
    provider: "photon",
    display,
    houseNumber: text(p.housenumber),
    road: text(p.street || p.name),
    city: text(p.city || p.locality || p.county),
    state: text(p.state),
    postalCode: text(p.postcode),
    country: text(p.countrycode).toUpperCase(),
    raw: geo,
    sourceUrl: photonUrl,
  };
}

async function authorized(request: Request) {
  const workerSecret = text(request.headers.get("x-kleenest-worker-secret"));
  if (workerSecret) {
    const { data, error } = await supabase.rpc("authorize_address_backfill_worker", {
      p_secret: workerSecret,
    });
    if (!error && data === true) return true;
  }

  const auth = text(request.headers.get("authorization"));
  if (!auth.toLowerCase().startsWith("bearer ")) return false;
  const token = auth.replace(/^Bearer\s+/i, "");
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin,role")
    .eq("id", user.id)
    .maybeSingle();
  return Boolean(profile?.is_admin) ||
    ["admin", "owner", "platform_admin", "super_admin"].includes(
      text(profile?.role).toLowerCase(),
    );
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!(await authorized(request))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body?.limit ?? 12), 1), 25);

  const { data: locations, error } = await supabase.rpc("address_backfill_candidates", {
    p_limit: limit,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results: Array<Record<string, unknown>> = [];
  for (const location of locations ?? []) {
    let reverse: ReverseResult;
    try {
      reverse = await reverseLookup(
        Number(location.latitude),
        Number(location.longitude),
      );
    } catch (error) {
      results.push({
        id: location.id,
        status: "error",
        error: error instanceof Error ? error.message : "Reverse geocoding failed",
      });
      await sleep(1100);
      continue;
    }

    const houseNumber = reverse.houseNumber;
    const road = reverse.road;
    const street = text([houseNumber, road].filter(Boolean).join(" "));
    const city = reverse.city;
    const state = reverse.state;
    const postalCode = reverse.postalCode;
    const country = reverse.country || text(location.country);
    const display = reverse.display;

    const { error: backfillError } = await supabase
      .from("location_address_backfills")
      .upsert({
        location_id: location.id,
        provider: reverse.provider,
        display_address: display || null,
        house_number: houseNumber || null,
        road: road || null,
        city: city || null,
        state: state || null,
        postal_code: postalCode || null,
        country: country || null,
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        fetched_at: new Date().toISOString(),
        source_url: reverse.sourceUrl,
        metadata: {
          source: text(body?.source) || "manual",
          provider: reverse.provider,
        },
        raw_data: reverse.raw ?? null,
      }, { onConflict: "location_id" });

    if (backfillError) {
      results.push({
        id: location.id,
        status: "error",
        error: backfillError.message,
      });
      await sleep(1100);
      continue;
    }

    const patch: Record<string, unknown> = {};
    if (placeholderAddress(location.address) && street) patch.address = street;
    if (!text(location.city) && city) patch.city = city;
    if (!text(location.state) && state) patch.state = state;
    if (!text(location.postal_code) && postalCode) patch.postal_code = postalCode;
    if (!text(location.country) && country) patch.country = country;

    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("locations")
        .update(patch)
        .eq("id", location.id);
      if (updateError) {
        results.push({
          id: location.id,
          status: "error",
          error: updateError.message,
        });
        await sleep(1100);
        continue;
      }
    }

    results.push({
      id: location.id,
      status: Object.keys(patch).length ? "updated" : "observed",
      address: patch.address ?? location.address ?? null,
      city: patch.city ?? location.city ?? null,
      state: patch.state ?? location.state ?? null,
      postal_code: patch.postal_code ?? location.postal_code ?? null,
    });
    await sleep(1100);
  }

  return Response.json({
    processed: results.length,
    updated: results.filter((item) => item.status === "updated").length,
    results,
  });
});
