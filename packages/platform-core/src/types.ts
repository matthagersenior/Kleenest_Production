export type AmenityMatchRule = 'all' | 'any';

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export type LineStringGeometry = {
  type: 'LineString';
  coordinates: [number, number][];
};

export type VerificationStatus =
  | 'verified'
  | 'needs_verification'
  | 'unverified'
  | 'conflicted'
  | 'unknown';

export type RecommendationReasonCode =
  | 'RECENTLY_VERIFIED'
  | 'VERIFIED'
  | 'HIGH_CONFIDENCE'
  | 'LOW_DISTANCE'
  | 'LOW_DETOUR'
  | 'REQUIRED_AMENITIES_MATCH'
  | 'PUBLIC_ACCESS'
  | 'ACCESSIBILITY_MATCH'
  | 'NEEDS_VERIFICATION';

export type TrustSummary = {
  confidence: number | null;
  verificationStatus: VerificationStatus;
  lastVerifiedAt: string | null;
  observationCount: number | null;
  freshnessAt: string | null;
};

export type RestroomAttributes = {
  publicAccess: boolean | null;
  wheelchairAccessible: boolean | null;
  changingTable: boolean | null;
  familyRestroom: boolean | null;
  open24Hours: boolean | null;
  amenityNames: string[];
};

export type PlaceIdentity = {
  kleenestPlaceId: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  externalIds?: Record<string, string>;
};

export type RecommendationRequirements = {
  amenityNames?: string[];
  amenityMatch?: AmenityMatchRule;
  publicAccess?: boolean;
  wheelchairAccessible?: boolean;
  changingTable?: boolean;
  familyRestroom?: boolean;
  open24Hours?: boolean;
};

export type NearbyRecommendationRequest = {
  location: GeoPoint;
  radiusMeters: number;
  maxRadiusMeters?: number;
  search?: string;
  requirements?: RecommendationRequirements;
  limit?: number;
};

export type RouteRecommendationRequest = {
  route: LineStringGeometry;
  corridorMeters: number;
  search?: string;
  requirements?: RecommendationRequirements;
  maxDetourMinutes?: number;
  limit?: number;
};

export type RecommendationCandidate = {
  place: PlaceIdentity;
  score: number;
  trust: TrustSummary;
  restroom: RestroomAttributes;
  distanceMeters: number | null;
  distanceAheadMeters: number | null;
  detourMinutes: number | null;
  reasonCodes: RecommendationReasonCode[];
  explanation: string;
  deepLink: string;
  source: 'kleenest';
};

export type RecommendationResponse = {
  recommendations: RecommendationCandidate[];
  metadata: {
    requestedAt: string;
    resultCount: number;
    expanded?: boolean;
    effectiveRadiusMeters?: number;
    attemptedRadiiMeters?: number[];
  };
};


export type PlaceDetails = {
  place: PlaceIdentity & {
    address: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    placeType: string | null;
    description: string | null;
    phone: string | null;
    website: string | null;
  };
  business: {
    id: string;
    name: string;
    description: string | null;
    website: string | null;
    phone: string | null;
    logoUrl: string | null;
    verificationStatus: string | null;
  } | null;
  restroom: RestroomAttributes & {
    smartBathroom: boolean | null;
    cleanlinessPct: number | null;
    rating: number | null;
    reviewCount: number | null;
    cleaningSchedule: string | null;
  };
  trust: TrustSummary & {
    positiveCount: number | null;
    negativeCount: number | null;
  };
  hours: Array<{
    dayOfWeek: number | null;
    opensAt: string | null;
    closesAt: string | null;
    is24Hours: boolean;
    notes: string | null;
  }>;
  promotions: Array<{
    id: string | null;
    title: string;
    description: string | null;
    discount: string | null;
    startsAt: string | null;
    endsAt: string | null;
  }>;
  photos: Array<{
    id: string | null;
    url: string;
    caption: string | null;
    isFeatured: boolean;
  }>;
  deepLink: string;
  source: 'kleenest';
};
