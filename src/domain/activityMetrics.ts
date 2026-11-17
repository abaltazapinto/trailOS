import type { GpsTrackPoint } from './activity';

const EARTH_RADIUS_METERS = 6_371_000;
const toRadians = (degrees: number) => degrees * Math.PI / 180;

/** Elapsed duration in seconds, including time spent stationary. */
export function calculateDuration(startTime: Date, endTime: Date): number {
  return Math.max(0, (endTime.getTime() - startTime.getTime()) / 1000);
}

/** Total surface distance in meters, using the haversine formula. */
export function calculateTrackDistance(points: readonly GpsTrackPoint[]): number {
  let distance = 0;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const latitudeDelta = toRadians(current.latitude - previous.latitude);
    const longitudeDelta = toRadians(current.longitude - previous.longitude);
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(toRadians(previous.latitude)) * Math.cos(toRadians(current.latitude))
      * Math.sin(longitudeDelta / 2) ** 2;
    // Clamp rounding error at coincident and antipodal points.
    const clamped = Math.max(0, Math.min(1, haversine));
    distance += 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
  }
  return distance;
}

/** Average speed in meters per second over the full elapsed duration. */
export function calculateAverageSpeed(distance: number, duration: number): number {
  return duration > 0 ? distance / duration : 0;
}

/**
 * Samples on each side of the centred moving average applied to GPS altitude.
 * With 4, uniform ±2 m noise stays below the 3 m threshold; each summit is
 * flattened by about 2–3 m.
 */
const ELEVATION_SMOOTHING_RADIUS = 4;

/**
 * Total climb in meters, robust to GPS altitude noise.
 *
 * Elevations are first smoothed with a centred moving average (edge samples are
 * repeated), then a climb only counts once it rises at least `thresholdMeters`
 * above the lowest point since the previous descent. Points without a finite
 * elevation are ignored. Returns `undefined` when fewer than two points carry an
 * elevation.
 */
export function calculateElevationGain(
  points: readonly GpsTrackPoint[],
  thresholdMeters = 3,
): number | undefined {
  const elevations: number[] = [];
  for (const point of points) {
    if (point.elevation !== undefined && Number.isFinite(point.elevation)) elevations.push(point.elevation);
  }
  if (elevations.length < 2) return undefined;

  const last = elevations.length - 1;
  const smoothed = elevations.map((_, index) => {
    let sum = 0;
    for (let offset = -ELEVATION_SMOOTHING_RADIUS; offset <= ELEVATION_SMOOTHING_RADIUS; offset++) {
      sum += elevations[Math.min(last, Math.max(0, index + offset))];
    }
    return sum / (2 * ELEVATION_SMOOTHING_RADIUS + 1);
  });

  let gain = 0;
  let low = smoothed[0];
  let high = smoothed[0];
  let climbing = false;
  for (const elevation of smoothed) {
    if (climbing) {
      if (elevation > high) high = elevation;
      else if (high - elevation >= thresholdMeters) {
        gain += high - low;
        climbing = false;
        low = elevation;
      }
    } else if (elevation < low) {
      low = elevation;
    } else if (elevation - low >= thresholdMeters) {
      climbing = true;
      high = elevation;
    }
  }
  if (climbing) gain += high - low;
  return gain;
}
