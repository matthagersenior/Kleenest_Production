import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const baseUrl = String(process.env.KLEENEST_API_BASE_URL ?? '').replace(/\/$/, '');
const apiKey = process.env.KLEENEST_API_KEY ?? '';

async function call(path: string, body: unknown = undefined, method: 'GET'|'POST' = 'POST') {
  if (!baseUrl) throw new Error('KLEENEST_API_BASE_URL is required');
  if (!apiKey) throw new Error('KLEENEST_API_KEY is required');
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-kleenest-api-key': apiKey,
    },
    body: method==='GET'?undefined:JSON.stringify(body),
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
        smartRestroom: z.boolean().optional(),
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
        smartRestroom: input.smartRestroom,
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
        smartRestroom: z.boolean().optional(),
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
        smartRestroom: input.smartRestroom,
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

  server.registerTool(
    'explain_place_intelligence',
    {
      description: 'Return deterministic Kleenest freshness, confidence, provenance and rationale for a canonical place. This explains stored evidence; it does not invent a score.',
      inputSchema: z.object({ placeId:z.string().uuid() }),
    },
    async input => textResult(await call('/v1/places/'+input.placeId+'/intelligence',undefined,'GET')),
  );

  server.registerTool(
    'get_place_proof',
    {
      description: 'Return the compact evidence proof card for a Kleenest place, including freshness, confidence, conflicts and amenities.',
      inputSchema: z.object({ placeId:z.string().uuid() }),
    },
    async input => textResult(await call('/v1/places/'+input.placeId+'/proof',undefined,'GET')),
  );

  server.registerTool(
    'check_verified_access',
    {
      description: 'Check the public/partner-safe Kleenest access projection for a canonical place.',
      inputSchema: z.object({ placeId:z.string().uuid() }),
    },
    async input => textResult(await call('/v1/places/'+input.placeId+'/access',undefined,'GET')),
  );

  server.registerTool(
    'explain_route_intelligence',
    {
      description: 'Return deterministic Kleenest route restroom intelligence and evidence-backed recommendations for a route corridor.',
      inputSchema: z.object({
        coordinates:z.array(z.tuple([z.number(),z.number()])).min(2).max(5000),
        corridorMeters:z.number().min(100).max(40234).default(8047),
        limit:z.number().int().min(1).max(25).default(10),
        amenityNames:z.array(z.string()).max(24).optional(),
      }),
    },
    async input => textResult(await call('/v1/intelligence/route',{
      route:{type:'LineString',coordinates:input.coordinates},
      corridorMeters:input.corridorMeters,
      limit:input.limit,
      requirements:{amenityNames:input.amenityNames??[],amenityMatch:'all'},
    })),
  );

  server.registerTool(
    'list_amenities',
    {
      description: 'List the canonical Kleenest amenity catalog, including Connected / Smart Restroom.',
      inputSchema: z.object({}),
    },
    async () => textResult(await call('/v1/amenities', undefined, 'GET')),
  );

  server.registerTool(
    'find_smart_restrooms',
    {
      description: 'Return nearby restrooms explicitly carrying the Connected / Smart Restroom capability.',
      inputSchema: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        radiusMeters: z.number().min(100).max(402336).default(16093),
        limit: z.number().int().min(1).max(25).default(5),
      }),
    },
    async input => textResult(await call('/v1/recommendations/nearby', {
      location:{latitude:input.latitude,longitude:input.longitude},
      radiusMeters:input.radiusMeters,limit:input.limit,
      requirements:{smartRestroom:true,amenityNames:[],amenityMatch:'all'},
    })),
  );

  server.registerTool(
    'list_smart_devices',
    {
      description: 'List Smart Devices exposed to this Kleenest integration, including status and declared capabilities.',
      inputSchema: z.object({}),
    },
    async () => textResult(await call('/v1/devices', {})),
  );

  server.registerTool(
    'command_smart_device',
    {
      description: 'Queue an audited command for a Smart Device. The device must explicitly declare the command capability; high-risk controls require KleenestOS approval.',
      inputSchema: z.object({
        deviceId: z.string().uuid(),
        command: z.string().min(1).max(120),
        arguments: z.record(z.string(), z.unknown()).optional(),
        idempotencyKey: z.string().min(1).max(240).optional(),
      }),
    },
    async input => textResult(await call('/v1/devices/' + input.deviceId + '/commands', {
      command: input.command,
      arguments: input.arguments ?? {},
      idempotencyKey: input.idempotencyKey,
    })),
  );
  return server;
});
