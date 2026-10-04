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
