import type { GpsTrackPoint } from '../activity';
import { calculateElevationGain } from '../activityMetrics';

const track = (elevations: readonly (number | undefined)[]): GpsTrackPoint[] =>
  elevations.map((elevation) => ({
    latitude: 38.7,
    longitude: -9.1,
    ...(elevation !== undefined ? { elevation } : {}),
  }));

/** Deterministic uniform noise in [-amplitude, amplitude]. */
function noise(count: number, amplitude: number, seed = 7): number[] {
  let state = seed;
  return Array.from({ length: count }, () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return (state / 2 ** 31) * 2 * amplitude - amplitude;
  });
}

const range = (count: number, step: number) => Array.from({ length: count }, (_, index) => index * step);

describe('calculateElevationGain', () => {
  test('flat track with alternating ±2 m noise has no gain', () => {
    expect(calculateElevationGain(track(range(600, 0).map((_, index) => (index % 2 ? 102 : 98))))).toBe(0);
  });

  test.each(range(25, 1).map((seed) => seed + 1))('flat track with random ±2 m noise has no gain (seed %i)', (seed) => {
    expect(calculateElevationGain(track(noise(2000, 2, seed).map((offset) => 100 + offset)))).toBe(0);
  });

  test('steady 100 m climb in 1 m steps is about 100 m', () => {
    const gain = calculateElevationGain(track(range(101, 1)));
    expect(gain).toBeGreaterThanOrEqual(97);
    expect(gain).toBeLessThanOrEqual(100);
  });

  test('100 m climb with ±2 m noise is about 100 m', () => {
    const offsets = noise(501, 2);
    const gain = calculateElevationGain(track(range(501, 0.2).map((elevation, index) => elevation + offsets[index])));
    expect(gain).toBeGreaterThanOrEqual(95);
    expect(gain).toBeLessThanOrEqual(104);
  });

  test('counts every climb on a rolling route and ignores descents', () => {
    // 50 m up, 50 m down, 50 m up: 100 m of climbing; smoothing rounds each turn by a few meters.
    const climbAndDescend = [...range(51, 1), ...range(51, 1).map((step) => 50 - step), ...range(51, 1)];
    const gain = calculateElevationGain(track(climbAndDescend));
    expect(gain).toBeGreaterThanOrEqual(90);
    expect(gain).toBeLessThanOrEqual(100);
    expect(calculateElevationGain(track(range(101, 1).map((step) => 100 - step)))).toBe(0);
  });

  test('ignores climbs smaller than the threshold', () => {
    expect(calculateElevationGain(track([0, 0, 0, 0, 0, 2, 2, 2, 2, 2]))).toBe(0);
  });

  test('ignores points without a finite elevation', () => {
    const climb = range(101, 1);
    const withGaps = climb.flatMap((elevation, index) => (index % 3 ? [elevation] : [elevation, undefined]));
    const withNaN = [...track(climb), { latitude: 38.7, longitude: -9.1, elevation: NaN }];
    expect(calculateElevationGain(track(withGaps))).toBe(calculateElevationGain(track(climb)));
    expect(calculateElevationGain(withNaN)).toBe(calculateElevationGain(track(climb)));
  });

  test('is unavailable with fewer than two elevation samples', () => {
    expect(calculateElevationGain([])).toBeUndefined();
    expect(calculateElevationGain(track([undefined, undefined]))).toBeUndefined();
    expect(calculateElevationGain(track([undefined, 120, undefined]))).toBeUndefined();
  });
});
