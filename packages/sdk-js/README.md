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
