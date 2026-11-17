import type { Sport } from '../domain/activity';

export const sportLabels: Record<Sport, string> = {
  hiking: 'Hiking',
  running: 'Running',
  cycling: 'Cycling',
};

export type MetricUnit = 'km' | 'h:m:s' | '/km' | 'km/h' | 'bpm' | 'm';

export interface FormattedMetric {
  value: string;
  unit: MetricUnit;
}

type MetricInput = number | null | undefined;

const isFiniteNumber = (value: MetricInput): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const unavailable = (unit: MetricUnit): FormattedMetric => ({ value: '--', unit });

/** SI meters to kilometers. Zero is a valid distance. */
export function formatDistance(meters: MetricInput): FormattedMetric {
  if (!isFiniteNumber(meters) || meters < 0) return unavailable('km');
  return { value: (meters / 1000).toFixed(2), unit: 'km' };
}

/** SI seconds to M:SS under an hour and H:MM:SS from an hour, without rounding up. */
export function formatDuration(duration: MetricInput): FormattedMetric {
  if (!isFiniteNumber(duration) || duration < 0) return unavailable('h:m:s');
  const seconds = Math.floor(duration);
  if (!Number.isSafeInteger(seconds)) return unavailable('h:m:s');
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const clock = `${String(seconds % 60).padStart(2, '0')}`;
  const value = hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${clock}`
    : `${minutes}:${clock}`;
  return { value, unit: 'h:m:s' };
}

/** Slowest pace shown; anything slower (e.g. standing still) is unavailable. */
const SLOWEST_PACE_SECONDS_PER_KM = 59 * 60 + 59;

/** SI meters/second to minutes:seconds per kilometer. Near-stationary pace is unavailable. */
export function formatPace(metersPerSecond: MetricInput): FormattedMetric {
  if (!isFiniteNumber(metersPerSecond) || metersPerSecond <= 0) return unavailable('/km');
  // Round the total first so a minute boundary never renders as e.g. 5:60.
  const seconds = Math.round(1000 / metersPerSecond);
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > SLOWEST_PACE_SECONDS_PER_KM) {
    return unavailable('/km');
  }
  return {
    value: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    unit: '/km',
  };
}

/** SI meters/second to kilometers/hour. Zero is a valid speed. */
export function formatSpeed(metersPerSecond: MetricInput): FormattedMetric {
  if (!isFiniteNumber(metersPerSecond) || metersPerSecond < 0) return unavailable('km/h');
  const kilometersPerHour = metersPerSecond * 3.6;
  if (!Number.isFinite(kilometersPerHour)) return unavailable('km/h');
  return { value: kilometersPerHour.toFixed(1), unit: 'km/h' };
}

/** Heart rate is already stored in bpm; a missing reading must never become zero. */
export function formatHeartRate(beatsPerMinute: MetricInput): FormattedMetric {
  if (!isFiniteNumber(beatsPerMinute) || beatsPerMinute <= 0) return unavailable('bpm');
  const rounded = Math.round(beatsPerMinute);
  if (!Number.isSafeInteger(rounded) || rounded <= 0) return unavailable('bpm');
  return { value: String(rounded), unit: 'bpm' };
}

/** SI meters, including elevations below sea level. No elevation-gain calculation. */
export function formatElevation(meters: MetricInput): FormattedMetric {
  if (!isFiniteNumber(meters)) return unavailable('m');
  const rounded = Math.round(meters);
  if (!Number.isSafeInteger(rounded)) return unavailable('m');
  return { value: String(rounded), unit: 'm' };
}

export function formatSpeedForSport(metersPerSecond: MetricInput, sport: Sport): FormattedMetric {
  return sport === 'cycling' ? formatSpeed(metersPerSecond) : formatPace(metersPerSecond);
}
