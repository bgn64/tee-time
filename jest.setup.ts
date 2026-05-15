/**
 * Global jest setup for the `unit` project.
 *
 * Registers manual mocks for native-only modules so that React Native code
 * paths can be imported in a JSDom-ish environment without crashing.
 *
 * Loaded via package.json's jest config: `setupFilesAfterEach` (per-project).
 */

// AsyncStorage — use the maintainer-published jest mock.
// eslint-disable-next-line @typescript-eslint/no-var-requires
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Splash screen — no-op.
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

// Fonts — pretend loaded.
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
}));

// Crypto — deterministic ids per test. Tests that care can override.
// virtual: true so this works before expo-crypto is installed in Phase 3.
jest.mock(
  'expo-crypto',
  () => {
    let mockCryptoCounter = 0;
    return {
      randomUUID: () => `uuid-test-${++mockCryptoCounter}`,
    };
  },
  { virtual: true }
);

// Reanimated needs its own mock for non-native test env.
jest.mock('react-native-reanimated', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native-reanimated/mock')
);

// expo-router — controllable router + hook stubs. The factory cannot
// reference outer-scope variables, so internal state is captured inline with
// `mock*` names (which jest's static analyzer allows).
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  let mockPathname = '/';
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    setParams: jest.fn(),
    __setPathname: (p: string) => {
      mockPathname = p;
    },
  };
  return {
    router: mockRouter,
    Link: ({ children }: { children?: React.ReactNode }) => children,
    Stack: Object.assign(
      ({ children }: { children?: React.ReactNode }) => children,
      {
        Screen: ({ children }: { children?: React.ReactNode }) =>
          children ?? null,
      }
    ),
    Tabs: Object.assign(
      ({ children }: { children?: React.ReactNode }) => children,
      {
        Screen: ({ children }: { children?: React.ReactNode }) =>
          children ?? null,
      }
    ),
    Slot: ({ children }: { children?: React.ReactNode }) => children,
    Redirect: () => null,
    useRouter: () => mockRouter,
    usePathname: () => mockPathname,
    useLocalSearchParams: () => ({}),
    useGlobalSearchParams: () => ({}),
    useSegments: () => [],
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => {
        const cleanup = cb();
        return typeof cleanup === 'function' ? cleanup : undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
    },
  };
});

// expo-linking — only useUrl is used in app code; safe to no-op.
jest.mock('expo-linking', () => ({
  createURL: (path: string) => path,
  parse: () => ({ path: '/', queryParams: {} }),
  useURL: () => null,
}));

// expo-location — coarse stubs; LocationContext tests can override.
jest.mock('expo-location', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 0, longitude: 0, accuracy: 10 },
    timestamp: 0,
  })),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
  Accuracy: { Balanced: 3, High: 4, Highest: 5 },
}));

// AppState — controllable emitter. Used by write-queue tests in Phase 3.
// The factory cannot reference outer-scope variables (jest static-analysis
// guard), so listeners + current state live on a module-prefixed name. Type
// aliases inside the factory must also be `mock*`-prefixed because jest's
// static analyzer treats type identifiers as variable references and only
// allows globals plus `mock*` names.
jest.mock('react-native/Libraries/AppState/AppState', () => {
  type MockAppStateValue = 'active' | 'background' | 'inactive';
  type MockListener = (mockNextState: MockAppStateValue) => void;
  const mockListeners = new Set<MockListener>();
  let mockCurrent: MockAppStateValue = 'active';
  return {
    __esModule: true,
    default: {
      get currentState(): MockAppStateValue {
        return mockCurrent;
      },
      addEventListener: (event: string, cb: MockListener) => {
        if (event === 'change') mockListeners.add(cb);
        return {
          remove: () => {
            mockListeners.delete(cb);
          },
        };
      },
      __emit: (next: MockAppStateValue) => {
        mockCurrent = next;
        for (const l of mockListeners) l(next);
      },
    },
  };
});

// Stub window.location for code that reads it (e.g. AccountContext diag log).
// jest-expo's environment provides `window` but not always a usable `location`.
if (typeof window !== 'undefined') {
  // @ts-ignore - test-only stub
  if (!window.location) {
    // @ts-ignore
    window.location = { href: 'http://test/', hash: '', search: '', origin: 'http://test' };
  }
}
