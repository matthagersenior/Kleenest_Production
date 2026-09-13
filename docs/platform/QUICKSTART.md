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
    clientToken: "YOUR_BROWSER_TOKEN"
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

Never embed a server API key in browser code. For Widget, Map, or other browser integrations, issue a publishable client token from the Developer Portal with an exact Allowed origin, an expiration of 30 days or less, and a separate per-minute cap. Server-to-server integrations should keep the server API key on the server.

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

const client = new KleenestClient({ baseUrl: API_BASE, clientToken: YOUR_BROWSER_TOKEN });

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

const client = new KleenestClient({ baseUrl: API_BASE, clientToken: YOUR_BROWSER_TOKEN });
const routes = new KleenestRouteClient(client);

const result = await routes.findStops({
  route: lineStringFromCoordinates([
    [-90.1994, 38.627],
    [-89.6501, 39.7817]
  ]),
  corridorMeters: 8047
});
```

## Developer Portal guided flow

The Developer Portal is designed to get a developer from sign-in to a proven integration without requiring them to create production credentials first.

1. Sign in and open the invited partner workspace.
2. Choose **Launch sandbox**. The portal issues a publishable token bound to the exact portal origin, capped at 15 requests per minute, expiring after one hour, and kept only in page memory.
3. Use the **API Playground** to run a live nearby or along-route request against the partner's real Kleenest product access and quota.
4. Inspect the rendered recommendations, visual result surface, raw response, and generated examples for cURL, JavaScript, Widget, Map, Route SDK, and MCP.
5. Load a scenario from the **Sample gallery** when a use-case is a better starting point than a blank request.
6. When the integration is proven, choose **Where will this run?** and issue the correct production credential:
   - server API key for trusted server/backend/MCP environments,
   - origin-restricted Browser token for Widget, Map, and browser SDK integrations.

Sandbox tokens are deliberately not persisted to browser storage. Refreshing or closing the portal discards the raw token even though its hashed credential record remains valid until expiration or revocation.

## External beta onboarding

The Developer Portal is invite-based for partner workspaces:

1. Create a developer account or sign in.
2. Claim the one-time partner invitation.
3. Open the partner workspace.
4. Issue a server API key for backend integrations, or a Browser token for public Widget/Map/browser integrations.
5. For a Browser token, enter the exact Allowed origin (for example `https://app.example.com`), expiration, and per-minute cap.
6. Configure webhooks if needed.
7. Integrate using REST, package artifacts, or the versioned ESM modules above.

Developer Portal:
`https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-developer-portal`
