import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(URL, KEY, { auth: { persistSession: false } });
const H = { "content-type": "application/json" };

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "POST required" }), { status: 405, headers: H });
    }
    const supplied = req.headers.get("x-kleenest-geo-archive") || "";
    const s = await db.rpc("get_internal_geo_archive_secret");
    if (s.error || !s.data || supplied !== s.data) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: H });
    }
    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (!rows.length || rows.length > 1000) {
      return new Response(JSON.stringify({ ok: false, error: "rows must contain 1..1000 items" }), { status: 400, headers: H });
    }
    const r = await db.rpc("ingest_cold_external_location_records", { p_rows: rows });
    if (r.error) throw r.error;
    return new Response(JSON.stringify({ ok: true, rows: r.data }), { headers: H });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: H });
  }
});
