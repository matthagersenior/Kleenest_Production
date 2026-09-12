# Kleenest Platform Integration Quickstart

Kleenest Platform beta v0.1.0 exposes the same recommendation engine through REST, browser modules, package artifacts, route helpers, widgets, maps and MCP.

## Production endpoints

- REST API: `https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-api`
- Distribution manifest: `https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-distribution/v1/manifest.json`
- OpenAPI 3.1: `https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-distribution/v1/openapi.json`
- JavaScript SDK module: `https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-distribution/v1/sdk.js`
- Widget module: `https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-distribution/v1/widget.js`
- Map module: `https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-distribution/v1/map.js`
- Route module: `https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-distribution/v1/route.js`

## Browser ESM

```html
<script type="module">
  import { KleenestClient } from "https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-distribution/v1/sdk.js";
  import { recommendationsToGeoJSON } from "https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-distribution/v1/map.js";

  const client = new KleenestClient({
    baseUrl: "https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-api",
    apiKey: "YOUR_PARTNER_KEY"
  });

  const result = await client.recommendNearby({
    location: { latitude: 38.627, longitude: -90.1994 },
    radiusMeters: 16093,
    limit: 5
  });

  console.log(result.recommendations);
  console.log(recommendationsToGeoJSON(result.recommendations));
</script>
```

Do not embed unrestricted production partner keys into public websites. Browser modules are intended for trusted prototypes or short-lived/public-client credentials once those are enabled. Server-to-server integrations should keep the API key on the server.

## Package artifacts

Every package-build workflow creates downloadable tarballs for:

- `@kleenest/platform-core@0.1.0`
- `@kleenest/sdk-js@0.1.0`
- `@kleenest/widget@0.1.0`
- `@kleenest/map-layer@0.1.0`
- `@kleenest/route-sdk@0.1.0`

The artifact bundle also contains SHA-256 checksums and the OpenAPI contract.

## Widget

```js
import { KleenestClient } from ".../v1/sdk.js";
import { mountKleenestFinder } from ".../v1/widget.js";

const client = new KleenestClient({ baseUrl: API_BASE, apiKey: YOUR_KEY });

mountKleenestFinder(document.querySelector("#restrooms"), {
  client,
  latitude: 38.627,
  longitude: -90.1994,
  radiusMeters: 16093
});
```

## Route SDK

```js
import { KleenestClient } from ".../v1/sdk.js";
import { KleenestRouteClient, lineStringFromCoordinates } from ".../v1/route.js";

const client = new KleenestClient({ baseUrl: API_BASE, apiKey: YOUR_KEY });
const routes = new KleenestRouteClient(client);

const result = await routes.findStops({
  route: lineStringFromCoordinates([
    [-90.1994, 38.627],
    [-89.6501, 39.7817]
  ]),
  corridorMeters: 8047
});
```

## External beta onboarding

The Developer Portal is invite-based for partner workspaces:

1. Create a developer account or sign in.
2. Claim the one-time partner invitation.
3. Open the partner workspace.
4. Issue a partner API key.
5. Configure webhooks if needed.
6. Integrate using REST, package artifacts, or the versioned ESM modules above.

Developer Portal:
`https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-developer-portal`
