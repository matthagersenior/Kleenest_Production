export type CheckInLocationFix = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
  };
  timestamp: number;
  mocked?: boolean;
};

export function isPreciseLocationPermission(
  permission: {
    status?: string;
    android?: { accuracy?: 'fine' | 'coarse' | 'none' };
    ios?: { accuracy?: 'full' | 'reduced' };
  } | null | undefined,
  platform: string,
): boolean;

export function selectBestLocationFix<T extends CheckInLocationFix>(fixes: T[]): T | null;
