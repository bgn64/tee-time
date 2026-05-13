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
 * `lib/geo.ts`. The rangefinder uses a foreground-only high-accuracy watch
 * while its sheet is open, then stops it to protect battery life.
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
import { AppState, AppStateStatus, Linking, Platform } from 'react-native';

export type LocationStatus = 'unknown' | 'granted' | 'denied' | 'unavailable';

export type Coords = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  timestamp?: number;
};

export type RangefinderLocation = Required<
  Pick<Coords, 'latitude' | 'longitude' | 'timestamp'>
> & {
  accuracyMeters: number | null;
};

type LocationContextValue = {
  status: LocationStatus;
  coords: Coords | null;
  rangefinderLocation: RangefinderLocation | null;
  rangefinderError: string | null;
  /**
   * Trigger the OS permission dialog. If permission is already granted,
   * just refreshes coords. Returns the resulting status so the caller
   * can react (e.g. update primer state to 'accepted' or 'denied').
   */
  request: () => Promise<LocationStatus>;
  /**
   * Start a high-accuracy foreground watch for the rangefinder. The caller
   * must stop it when the rangefinder closes.
   */
  startRangefinderWatch: () => Promise<LocationStatus>;
  /** Stop the high-accuracy rangefinder watch. */
  stopRangefinderWatch: () => void;
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
      accuracyMeters: pos.coords.accuracy,
      timestamp: pos.timestamp,
    };
  } catch (e) {
    console.warn('[location] getCurrentPosition failed:', e);
    return null;
  }
}

function toRangefinderLocation(pos: Location.LocationObject): RangefinderLocation {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracyMeters: pos.coords.accuracy,
    timestamp: pos.timestamp,
  };
}

export function LocationProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<LocationStatus>('unknown');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [rangefinderLocation, setRangefinderLocation] =
    useState<RangefinderLocation | null>(null);
  const [rangefinderError, setRangefinderError] = useState<string | null>(null);

  // Avoid running getCurrentPosition more than once concurrently — it
  // can be slow on a cold start and cheap to debounce.
  const fetchingRef = useRef(false);
  const rangefinderWantedRef = useRef(false);
  const rangefinderSubRef = useRef<Location.LocationSubscription | null>(null);
  const rangefinderStartTokenRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const statusRef = useRef<LocationStatus>(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const stopRangefinderWatch = useCallback(() => {
    rangefinderWantedRef.current = false;
    rangefinderStartTokenRef.current += 1;
    rangefinderSubRef.current?.remove();
    rangefinderSubRef.current = null;
  }, []);

  const beginRangefinderWatch = useCallback(async (): Promise<LocationStatus> => {
    const token = rangefinderStartTokenRef.current + 1;
    rangefinderStartTokenRef.current = token;
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      let mapped = mapStatus(permission.status);
      if (mapped !== 'granted') {
        const requested = await Location.requestForegroundPermissionsAsync();
        mapped = mapStatus(requested.status);
      }
      setStatus(mapped);
      if (mapped !== 'granted') {
        rangefinderSubRef.current?.remove();
        rangefinderSubRef.current = null;
        setRangefinderError(
          mapped === 'denied'
            ? 'Location permission is required to measure on-course distances.'
            : 'Location is not available on this device.'
        );
        return mapped;
      }

      setRangefinderError(null);
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      if (rangefinderStartTokenRef.current !== token || !rangefinderWantedRef.current) {
        return 'granted';
      }
      const initial = toRangefinderLocation(current);
      setRangefinderLocation(initial);
      setCoords(initial);

      rangefinderSubRef.current?.remove();
      rangefinderSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (pos) => {
          const next = toRangefinderLocation(pos);
          setRangefinderLocation(next);
          setCoords(next);
          setRangefinderError(null);
        },
        (error) => {
          console.warn('[location] rangefinder watch failed:', error);
          setRangefinderError('Unable to update your current location.');
        }
      );
      return 'granted';
    } catch (e) {
      console.warn('[location] rangefinder watch setup failed:', e);
      setStatus('unavailable');
      setRangefinderError('Unable to start rangefinder GPS.');
      return 'unavailable';
    }
  }, []);

  const startRangefinderWatch = useCallback(async (): Promise<LocationStatus> => {
    rangefinderWantedRef.current = true;
    if (appStateRef.current !== 'active') {
      return statusRef.current;
    }
    return beginRangefinderWatch();
  }, [beginRangefinderWatch]);

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

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        if (rangefinderWantedRef.current) {
          void beginRangefinderWatch();
        }
        return;
      }
      rangefinderSubRef.current?.remove();
      rangefinderSubRef.current = null;
    });
    return () => {
      sub.remove();
      rangefinderSubRef.current?.remove();
      rangefinderSubRef.current = null;
    };
  }, [beginRangefinderWatch]);

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
    () => ({
      status,
      coords,
      rangefinderLocation,
      rangefinderError,
      request,
      startRangefinderWatch,
      stopRangefinderWatch,
      openSystemSettings,
    }),
    [
      status,
      coords,
      rangefinderLocation,
      rangefinderError,
      request,
      startRangefinderWatch,
      stopRangefinderWatch,
      openSystemSettings,
    ]
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
