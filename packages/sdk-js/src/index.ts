import type {
  NearbyRecommendationRequest,
  RecommendationResponse,
  RouteRecommendationRequest,
} from '@kleenest/platform-core';

export type KleenestClientOptions = {
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
};

export class KleenestClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: KleenestClientOptions) {
    this.baseUrl = String(options.baseUrl || '').replace(/\/$/, '');
    if (!this.baseUrl) throw new Error('baseUrl is required');
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) throw new Error('A fetch implementation is required');
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (this.apiKey) headers.set('x-kleenest-api-key', this.apiKey);

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Kleenest API request failed with status ${response.status}`;
      throw new Error(message);
    }
    return payload as T;
  }

  health(): Promise<{ ok: boolean; service: string; version: string }> {
    return this.request('/health');
  }

  recommendNearby(input: NearbyRecommendationRequest): Promise<RecommendationResponse> {
    return this.request('/v1/recommendations/nearby', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  recommendRoute(input: RouteRecommendationRequest): Promise<RecommendationResponse> {
    return this.request('/v1/recommendations/route', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}

export type {
  NearbyRecommendationRequest,
  RecommendationResponse,
  RouteRecommendationRequest,
} from '@kleenest/platform-core';
