import type { KleenestClient } from '@kleenest/sdk-js';
import type {
  LineStringGeometry,
  RecommendationRequirements,
  RecommendationResponse,
} from '@kleenest/platform-core';

export type RouteStopOptions = {
  route: LineStringGeometry;
  corridorMeters?: number;
  requirements?: RecommendationRequirements;
  maxDetourMinutes?: number;
  limit?: number;
};

export class KleenestRouteClient {
  constructor(private readonly client: KleenestClient) {}

  findStops(options: RouteStopOptions): Promise<RecommendationResponse> {
    return this.client.recommendRoute({
      route: options.route,
      corridorMeters: options.corridorMeters ?? 8047,
      requirements: options.requirements,
      maxDetourMinutes: options.maxDetourMinutes,
      limit: options.limit ?? 10,
    });
  }

  async nextStop(options: RouteStopOptions) {
    const result = await this.findStops({ ...options, limit: Math.max(1, options.limit ?? 1) });
    return result.recommendations[0] ?? null;
  }
}

export function lineStringFromCoordinates(coordinates: Array<[number, number]>): LineStringGeometry {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error('A route requires at least two coordinates');
  }
  return { type: 'LineString', coordinates };
}
