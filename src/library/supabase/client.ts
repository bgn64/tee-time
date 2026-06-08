/**
 * Shared Supabase client.
 *
 * During the PowerSync → REST migration this re-exports the exact client
 * instance PowerSync's connector already uses, so auth/session state stays
 * consistent across the app (a second GoTrue client on the same storage key
 * would fight over the session). New React Query data hooks import `supabase`
 * from here. Phase 4 (PowerSync removal) flips this module to own the client
 * directly and drops the `system` import.
 */
import { system } from '@/library/powersync/system';

export const supabase = system.supabaseConnector.client;
