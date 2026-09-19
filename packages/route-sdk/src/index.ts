import type {
  LineStringGeometry,
  RecommendationRequirements,
  RecommendationResponse,
  RouteRecommendationRequest,
  PublicRouteIntelligence,
} from '@kleenest/platform-core';

export type RouteRecommendationTransport = {
  recommendRoute(input: RouteRecommendationRequest): Promise<RecommendationResponse>;
};
export type RouteIntelligenceTransport = {
  getRouteIntelligence(input:RouteRecommendationRequest):Promise<PublicRouteIntelligence>;
};

export type RouteStopOptions = {
  route: LineStringGeometry;
  corridorMeters?: number;
  requirements?: RecommendationRequirements;
  maxDetourMinutes?: number;
  limit?: number;
};

export class KleenestRouteClient {
  constructor(private readonly transport: RouteRecommendationTransport & Partial<RouteIntelligenceTransport>) {}

  findStops(options: RouteStopOptions): Promise<RecommendationResponse> {
    return this.transport.recommendRoute({
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

  getRouteIntelligence(options:RouteStopOptions):Promise<PublicRouteIntelligence>{
    if(!this.transport.getRouteIntelligence)throw new Error('This transport does not expose Kleenest route intelligence.');
    return this.transport.getRouteIntelligence({
      route:options.route,
      corridorMeters:options.corridorMeters??8047,
      requirements:options.requirements,
      maxDetourMinutes:options.maxDetourMinutes,
      limit:options.limit??10,
    });
  }
}

export function lineStringFromCoordinates(coordinates: Array<[number, number]>): LineStringGeometry {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error('A route requires at least two coordinates');
  }
  return { type: 'LineString', coordinates };
}
