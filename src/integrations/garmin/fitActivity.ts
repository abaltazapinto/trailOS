import { Decoder, Stream } from '@garmin/fitsdk';
import { unzipSync } from 'fflate';

import type { Activity, GpsTrackPoint, Sport } from '../../domain/activity';
import { calculateAverageSpeed, calculateDuration, calculateTrackDistance } from '../../domain/activityMetrics';

/** FIT stores coordinates as semicircles: 2^31 semicircles = 180 degrees. */
const SEMICIRCLES_TO_DEGREES = 180 / 2 ** 31;

/** An import failure whose message is safe to show to the user. */
export class FitImportError extends Error {}

export interface ParsedFitActivity {
  activity: Omit<Activity, 'id'>;
  /** Sport as recorded by the Garmin device, e.g. "running" or "walking". */
  garminSport: string;
}

/** Garmin sports that map onto trailOS sports; anything else falls back to hiking. */
const SPORTS: Partial<Record<string, Sport>> = {
  running: 'running',
  cycling: 'cycling',
  eBiking: 'cycling',
  hiking: 'hiking',
  walking: 'hiking',
  mountaineering: 'hiking',
  snowshoeing: 'hiking',
};

const isZip = (bytes: Uint8Array) =>
  bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

const toDate = (value: unknown): Date | undefined =>
  value instanceof Date && !Number.isNaN(value.getTime()) ? value : undefined;

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function sumDefined(values: unknown[]): number | undefined {
  const numbers = values.filter(isNumber);
  return numbers.length > 0 ? numbers.reduce((total, value) => total + value, 0) : undefined;
}

function earliest(dates: (Date | undefined)[]): Date | undefined {
  return dates.reduce<Date | undefined>(
    (min, date) => (date && (!min || date < min) ? date : min), undefined);
}

function latest(dates: (Date | undefined)[]): Date | undefined {
  return dates.reduce<Date | undefined>(
    (max, date) => (date && (!max || date > max) ? date : max), undefined);
}

/**
 * Returns the FIT payloads in a file: a raw .fit as-is, or each .fit inside a zip, which is how
 * Garmin Connect delivers original activity files (API download and "Export Original").
 */
export function extractFitPayloads(bytes: Uint8Array): Uint8Array[] {
  if (!isZip(bytes)) return [bytes];
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, { filter: (file) => file.name.toLowerCase().endsWith('.fit') });
  } catch {
    throw new FitImportError('The zip file is damaged and could not be opened.');
  }
  const payloads = Object.values(entries);
  // Activities uploaded to Garmin Connect as GPX or TCX come back without a .fit file.
  if (payloads.length === 0) throw new FitImportError('The file does not contain a .fit activity.');
  return payloads;
}

/** Decodes a Garmin FIT activity file into a completed trailOS activity. */
export function parseFitActivity(bytes: Uint8Array): ParsedFitActivity {
  const stream = Stream.fromBuffer(bytes);
  if (!Decoder.isFIT(stream)) throw new FitImportError('This is not a Garmin FIT file.');
  const { messages, errors } = new Decoder(stream).read();
  // Reject partial reads: a truncated import would block re-importing the intact file as a duplicate.
  if (errors.length > 0) throw new FitImportError('This FIT file is damaged or incomplete.');

  const fileType = messages.fileIdMesgs?.[0]?.type;
  if (fileType !== undefined && fileType !== 'activity') {
    throw new FitImportError(`This FIT file is a ${String(fileType)} file, not an activity.`);
  }

  const records = messages.recordMesgs ?? [];
  // Transition sessions in multisport files carry no sport of their own.
  const sessions = (messages.sessionMesgs ?? []).filter((session) => session.sport !== 'transition');
  if (records.length === 0 && sessions.length === 0) {
    throw new FitImportError('This FIT file does not contain any activity data.');
  }

  const trackPoints: GpsTrackPoint[] = [];
  for (const record of records) {
    // Indoor activities and GPS dropouts produce records without a position.
    if (!isNumber(record.positionLat) || !isNumber(record.positionLong)) continue;
    const timestamp = toDate(record.timestamp);
    const elevation = record.enhancedAltitude ?? record.altitude;
    trackPoints.push({
      latitude: record.positionLat * SEMICIRCLES_TO_DEGREES,
      longitude: record.positionLong * SEMICIRCLES_TO_DEGREES,
      ...(timestamp ? { timestamp } : {}),
      ...(isNumber(elevation) ? { elevation } : {}),
      ...(isNumber(record.heartRate) ? { heartRate: record.heartRate } : {}),
    });
  }

  const recordTimes = records.map((record) => toDate(record.timestamp));
  const startTime = earliest(sessions.map((session) => toDate(session.startTime)))
    ?? earliest(recordTimes);
  if (!startTime) throw new FitImportError('This FIT file has no start time.');
  const sessionEnds = sessions.map((session) => {
    const start = toDate(session.startTime);
    return start && isNumber(session.totalElapsedTime)
      ? new Date(start.getTime() + session.totalElapsedTime * 1000)
      : toDate(session.timestamp);
  });
  const endTime = latest([...sessionEnds, ...recordTimes, startTime]) ?? startTime;

  const duration = calculateDuration(startTime, endTime);
  // Prefer the watch's distance: it is smoothed and also covers stretches without GPS.
  const distance = sumDefined(sessions.map((session) => session.totalDistance))
    ?? calculateTrackDistance(trackPoints);
  const elevationGain = sumDefined(sessions.map((session) => session.totalAscent));
  const rawSport = sessions[0]?.sport;
  const garminSport = typeof rawSport === 'string' ? rawSport : 'unknown';

  return {
    garminSport,
    activity: {
      source: 'garmin-fit',
      sport: SPORTS[garminSport] ?? 'hiking',
      startTime,
      endTime,
      duration,
      distance,
      averageSpeed: calculateAverageSpeed(distance, duration),
      trackPoints,
      ...(elevationGain !== undefined ? { elevationGain } : {}),
    },
  };
}
