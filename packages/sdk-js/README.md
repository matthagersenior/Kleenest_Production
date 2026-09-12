# @kleenest/sdk-js

Typed JavaScript client for the Kleenest REST API.

```ts
import { KleenestClient } from '@kleenest/sdk-js';

const client = new KleenestClient({
  baseUrl: 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-api',
  apiKey: process.env.KLEENEST_API_KEY,
});

const result = await client.recommendNearby({
  location: { latitude: 38.627, longitude: -90.1994 },
  radiusMeters: 16093,
});
```

Keep server API keys out of browser bundles.


## Browser integrations

Never embed a server API key in browser code. Issue an origin-restricted Browser token from the Kleenest Developer Portal and use `clientToken`:

```ts
const client = new KleenestClient({
  baseUrl: 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-api',
  clientToken: 'YOUR_BROWSER_TOKEN',
});
```

Browser tokens are read-only, expire within 30 days, require an exact Allowed origin, and have an independent per-minute cap.
