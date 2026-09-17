const EXPECTED_ISSUER = "https://token.actions.githubusercontent.com";
const EXPECTED_AUDIENCE = "kleenest-supabase-production-readiness";
const EXPECTED_REPOSITORY = "matthagersenior/Kleenest_Production";
const EXPECTED_REF = "refs/heads/main";
const EXPECTED_WORKFLOW_REF = `${EXPECTED_REPOSITORY}/.github/workflows/supabase-production-migrations.yml@${EXPECTED_REF}`;
const ALLOWED_EVENTS = new Set(["workflow_run", "workflow_dispatch"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function decodeJsonSegment(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(segment)));
}

async function verifyGitHubOidc(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed OIDC token");

  const header = decodeJsonSegment(parts[0]);
  const claims = decodeJsonSegment(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Unsupported OIDC signing key");

  const discoveryRes = await fetch(`${EXPECTED_ISSUER}/.well-known/openid-configuration`, { headers: { accept: "application/json" } });
  if (!discoveryRes.ok) throw new Error("GitHub OIDC discovery failed");
  const discovery = await discoveryRes.json();
  if (typeof discovery.jwks_uri !== "string") throw new Error("GitHub OIDC JWKS URI missing");

  const jwksRes = await fetch(discovery.jwks_uri, { headers: { accept: "application/json" } });
  if (!jwksRes.ok) throw new Error("GitHub OIDC JWKS fetch failed");
  const jwks = await jwksRes.json();
  const jwk = Array.isArray(jwks.keys) ? jwks.keys.find((key: Record<string, unknown>) => key.kid === header.kid && key.kty === "RSA") : undefined;
  if (!jwk) throw new Error("GitHub OIDC signing key not found");

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const verified = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, decodeBase64Url(parts[2]), signed);
  if (!verified) throw new Error("Invalid OIDC signature");

  const now = Math.floor(Date.now() / 1000);
  const exp = Number(claims.exp ?? 0);
  const nbf = Number(claims.nbf ?? 0);
  if (!Number.isFinite(exp) || exp <= now - 30) throw new Error("OIDC token expired");
  if (nbf && nbf > now + 30) throw new Error("OIDC token not active");
  if (claims.iss !== EXPECTED_ISSUER) throw new Error("Unexpected OIDC issuer");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(EXPECTED_AUDIENCE)) throw new Error("Unexpected OIDC audience");
  if (claims.repository !== EXPECTED_REPOSITORY) throw new Error("Unexpected repository");
  if (claims.ref !== EXPECTED_REF) throw new Error("Unexpected ref");
  if (claims.workflow_ref !== EXPECTED_WORKFLOW_REF) throw new Error("Unexpected workflow");
  if (!ALLOWED_EVENTS.has(String(claims.event_name ?? ""))) throw new Error("Unexpected GitHub event");
  if (typeof claims.sha !== "string" || !/^[0-9a-f]{40}$/.test(claims.sha)) throw new Error("Missing workflow SHA");

  return claims;
}

async function isMigrationApplied(version: string): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase runtime credentials unavailable");

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/production_migration_applied`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ p_version: version }),
  });
  if (!response.ok) throw new Error(`Migration readiness RPC failed (${response.status})`);
  return Boolean(await response.json());
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = request.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "GitHub OIDC token required" }, 401);
    const claims = await verifyGitHubOidc(auth.slice(7));

    const body = await request.json();
    const versions = Array.isArray(body?.versions) ? body.versions : [];
    if (versions.length < 1 || versions.length > 100 || versions.some((v: unknown) => typeof v !== "string" || !/^\d{14}$/.test(v))) {
      return json({ error: "versions must contain 1-100 migration timestamps" }, 400);
    }
    if (body.expected_sha !== claims.sha) return json({ error: "Workflow SHA does not match OIDC claim" }, 403);

    const unique = [...new Set(versions as string[])];
    const results: Record<string, boolean> = {};
    for (const version of unique) results[version] = await isMigrationApplied(version);
    const missing = unique.filter((version) => !results[version]);

    return json({
      ready: missing.length === 0,
      checked: unique.length,
      missing,
      sha: claims.sha,
    }, missing.length === 0 ? 200 : 409);
  } catch (error) {
    console.error("production-migration-readiness rejected request", error);
    return json({ error: "Unauthorized production readiness request" }, 401);
  }
});
