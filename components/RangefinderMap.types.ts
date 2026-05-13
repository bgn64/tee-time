import type { LatLon } from '@/lib/geo';

export type RangefinderMapProps = {
  userLocation: LatLon | null;
  targetLocation: LatLon | null;
  initialCenter: LatLon | null;
  accuracyMeters?: number | null;
  onTargetChange: (coords: LatLon) => void;
};
