/**
 * Location context — wraps the device geolocation API into one stable
 * surface. Used to sort the Score-tab course search by distance.
 *
 * Permission lifecycle is intentionally separate from this context: the
 * OnboardingContext owns the primer state machine and decides when to
 * call `request()`. This context only reports what the OS currently
 * thinks and provides the API to ask.
 *
 * Coordinates never leave the device. There is no DB column, no RPC; the
 * Score tab uses the raw lat/lon client-side to sort search results via
 * `lib/geo.ts`.
 *
 * Cross-platform notes:
 *   · Native (iOS / Android): expo-location.
 *   · Web: same expo-location surface; under the hood uses navigator.geolocation.
 *   · expo-location's permission-status enum maps onto our four-state
 *     local status: 'unknown' (haven't asked) / 'granted' / 'denied' /
 *     'unavailable' (platform refuses or hardware off).
 */

import * as Location from 'expo-location';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Linking, Platform } from 'react-native';

export type LocationStatus = 'unknown' | 'granted' | 'denied' | 'unavailable';

export type Coords = { latitude: number; longitude: number };

type LocationContextValue = {
  status: LocationStatus;
  coords: Coords | null;
  /**
   * Trigger the OS permission dialog. If permission is already granted,
   * just refreshes coords. Returns the resulting status so the caller
   * can react (e.g. update primer state to 'accepted' or 'denied').
   */
  request: () => Promise<LocationStatus>;
  /**
   * Open the system app-settings page so the user can re-grant
   * permission after they denied. iOS / Android only; on web this is a
   * no-op since browser permissions live in site settings.
   */
  openSystemSettings: () => Promise<void>;
};

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

function mapStatus(s: Location.PermissionStatus | undefined): LocationStatus {
  switch (s) {
    case Location.PermissionStatus.GRANTED:
      return 'granted';
    case Location.PermissionStatus.DENIED:
      return 'denied';
    case Location.PermissionStatus.UNDETERMINED:
      return 'unknown';
    default:
      return 'unknown';
  }
}

async function fetchCoords(): Promise<Coords | null> {
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    };
  } catch (e) {
    console.warn('[location] getCurrentPosition failed:', e);
    return null;
  }
}

export function LocationProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<LocationStatus>('unknown');
  const [coords, setCoords] = useState<Coords | null>(null);

  // Avoid running getCurrentPosition more than once concurrently — it
  // can be slow on a cold start and cheap to debounce.
  const fetchingRef = useRef(false);

  // On mount: check current permission state without prompting.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status: s } = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        const mapped = mapStatus(s);
        setStatus(mapped);
        if (mapped === 'granted' && !fetchingRef.current) {
          fetchingRef.current = true;
          const c = await fetchCoords();
          fetchingRef.current = false;
          if (!cancelled && c) setCoords(c);
        }
      } catch (e) {
        if (cancelled) return;
        console.warn('[location] initial permission check failed:', e);
        setStatus('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const request = useCallback(async (): Promise<LocationStatus> => {
    try {
      const { status: s } = await Location.requestForegroundPermissionsAsync();
      const mapped = mapStatus(s);
      setStatus(mapped);
      if (mapped === 'granted') {
        if (!fetchingRef.current) {
          fetchingRef.current = true;
          const c = await fetchCoords();
          fetchingRef.current = false;
          if (c) setCoords(c);
        }
      } else {
        setCoords(null);
      }
      return mapped;
    } catch (e) {
      console.warn('[location] permission request failed:', e);
      setStatus('unavailable');
      return 'unavailable';
    }
  }, []);

  const openSystemSettings = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      await Linking.openSettings();
    } catch (e) {
      console.warn('[location] openSettings failed:', e);
    }
  }, []);

  const value = useMemo<LocationContextValue>(
    () => ({ status, coords, request, openSystemSettings }),
    [status, coords, request, openSystemSettings]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error('useLocation must be used inside LocationProvider.');
  }
  return ctx;
}
