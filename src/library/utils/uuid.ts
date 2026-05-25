/**
 * Minimal RFC4122-ish v4 UUID generator that works on web and React Native
 * without any extra polyfills. Suitable for client-generated row IDs in a demo.
 */
export function uuid(): string {
  // Prefer the platform's crypto.randomUUID when available.
  const g: any = globalThis as any;
  if (g.crypto && typeof g.crypto.randomUUID === 'function') {
    return g.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
