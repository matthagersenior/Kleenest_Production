import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const baseUrl = String(process.env.KLEENEST_API_BASE_URL ?? '').replace(/\/$/, '');
const apiKey = process.env.KLEENEST_API_KEY ?? '';

async function call(path: string, body: unknown) {
  if (!baseUrl) throw new Error('KLEENEST_API_BASE_URL is required');
  if (!apiKey) throw new Error('KLEENEST_API_KEY is required');
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-kleenest-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String((payload as any)?.error ?? `Kleenest API failed with ${response.status}`));
  return payload;
}

function textResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  };
}

serveStdio(() => {
  const server = new McpServer({ name: 'kleenest', version: '0.1.0' });

  server.registerTool(
    'find_nearby_restrooms',
    {
      description: 'Return ranked Kleenest restroom recommendations near a geographic point.',
      inputSchema: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        radiusMeters: z.number().min(100).max(402336).default(16093),
        limit: z.number().int().min(1).max(25).default(5),
        amenityNames: z.array(z.string()).max(24).optional(),
        amenityMatch: z.enum(['all', 'any']).default('any'),
        search: z.string().max(320).optional(),
      }),
    },
    async input => textResult(await call('/v1/recommendations/nearby', {
      location: { latitude: input.latitude, longitude: input.longitude },
      radiusMeters: input.radiusMeters,
      limit: input.limit,
      search: input.search,
      requirements: {
        amenityNames: input.amenityNames ?? [],
        amenityMatch: input.amenityMatch,
      },
    })),
  );

  server.registerTool(
    'find_restrooms_along_route',
    {
      description: 'Return ranked Kleenest restroom recommendations along a route corridor.',
      inputSchema: z.object({
        coordinates: z.array(z.tuple([z.number(), z.number()])).min(2).max(5000),
        corridorMeters: z.number().min(100).max(40234).default(8047),
        limit: z.number().int().min(1).max(25).default(10),
        amenityNames: z.array(z.string()).max(24).optional(),
        amenityMatch: z.enum(['all', 'any']).default('any'),
        search: z.string().max(320).optional(),
      }),
    },
    async input => textResult(await call('/v1/recommendations/route', {
      route: { type: 'LineString', coordinates: input.coordinates },
      corridorMeters: input.corridorMeters,
      limit: input.limit,
      search: input.search,
      requirements: {
        amenityNames: input.amenityNames ?? [],
        amenityMatch: input.amenityMatch,
      },
    })),
  );

  server.registerTool(
    'find_next_restroom',
    {
      description: 'Return the highest-ranked Kleenest restroom option along a route.',
      inputSchema: z.object({
        coordinates: z.array(z.tuple([z.number(), z.number()])).min(2).max(5000),
        corridorMeters: z.number().min(100).max(40234).default(8047),
        amenityNames: z.array(z.string()).max(24).optional(),
      }),
    },
    async input => {
      const result = await call('/v1/recommendations/route', {
        route: { type: 'LineString', coordinates: input.coordinates },
        corridorMeters: input.corridorMeters,
        limit: 1,
        requirements: { amenityNames: input.amenityNames ?? [], amenityMatch: 'all' },
      }) as any;
      return textResult(result?.recommendations?.[0] ?? null);
    },
  );

  return server;
});
