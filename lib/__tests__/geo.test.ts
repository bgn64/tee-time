import { distanceMiles, distanceYards, formatMiles, formatYards } from '@/lib/geo';

describe('distanceMiles', () => {
  test('returns 0 for identical points', () => {
    const p = { latitude: 47.6062, longitude: -122.3321 };
    expect(distanceMiles(p, p)).toBeCloseTo(0, 5);
  });

  test('approx distance Seattle → Portland (~145 mi)', () => {
    const sea = { latitude: 47.6062, longitude: -122.3321 };
    const pdx = { latitude: 45.5152, longitude: -122.6784 };
    const d = distanceMiles(sea, pdx);
    expect(d).toBeGreaterThan(140);
    expect(d).toBeLessThan(150);
  });

  test('approx distance Seattle → Bellevue (~7 mi)', () => {
    const sea = { latitude: 47.6062, longitude: -122.3321 };
    const blv = { latitude: 47.6101, longitude: -122.2015 };
    const d = distanceMiles(sea, blv);
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(10);
  });

  test('symmetric', () => {
    const a = { latitude: 47.6062, longitude: -122.3321 };
    const b = { latitude: 45.5152, longitude: -122.6784 };
    expect(distanceMiles(a, b)).toBeCloseTo(distanceMiles(b, a), 6);
  });
});

describe('formatMiles', () => {
  test('formats sub-mile with one decimal', () => {
    expect(formatMiles(0.4)).toBe('0.4 mi');
    expect(formatMiles(0.05)).toBe('0.1 mi');
  });

  test('rounds whole miles to integer', () => {
    expect(formatMiles(2.4)).toBe('2 mi');
    expect(formatMiles(2.6)).toBe('3 mi');
    expect(formatMiles(120)).toBe('120 mi');
  });

  test('rejects negative / non-finite input', () => {
    expect(formatMiles(-1)).toBe('');
    expect(formatMiles(NaN)).toBe('');
    expect(formatMiles(Infinity)).toBe('');
  });
});

describe('distanceYards', () => {
  test('returns 0 for identical points', () => {
    const p = { latitude: 47.6062, longitude: -122.3321 };
    expect(distanceYards(p, p)).toBeCloseTo(0, 5);
  });

  test('matches mile conversion', () => {
    const a = { latitude: 47.6062, longitude: -122.3321 };
    const b = { latitude: 47.6072, longitude: -122.3321 };
    expect(distanceYards(a, b)).toBeCloseTo(distanceMiles(a, b) * 1760, 6);
  });

  test('computes a representative short golf distance', () => {
    const teeShot = { latitude: 47.6062, longitude: -122.3321 };
    const target = { latitude: 47.6074, longitude: -122.3321 };
    const yards = distanceYards(teeShot, target);
    expect(yards).toBeGreaterThan(140);
    expect(yards).toBeLessThan(150);
  });
});

describe('formatYards', () => {
  test('rounds to whole yards', () => {
    expect(formatYards(147.4)).toBe('147 yd');
    expect(formatYards(147.5)).toBe('148 yd');
  });

  test('rejects negative / non-finite input', () => {
    expect(formatYards(-1)).toBe('');
    expect(formatYards(NaN)).toBe('');
    expect(formatYards(Infinity)).toBe('');
  });
});
