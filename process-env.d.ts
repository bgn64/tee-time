// Typings for the EXPO_PUBLIC_* env vars used by the PowerSync + Supabase setup.
// Imported automatically by tsc because it is in the project's `include` glob.
export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      [key: string]: string | undefined;
      EXPO_PUBLIC_SUPABASE_URL: string;
      EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
      EXPO_PUBLIC_POWERSYNC_URL: string;
    }
  }
}
