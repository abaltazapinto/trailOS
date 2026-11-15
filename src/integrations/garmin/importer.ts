import { File } from 'expo-file-system';

import type { Activity } from '../../domain/activity';
import { findActivityId, getLatestActivityStart, saveCompletedActivity } from '../../storage/activities';
import { extractFitPayloads, FitImportError, parseFitActivity } from './fitActivity';
import { GarminApiError, GarminPersonalApi, type GarminActivitySummary } from './personalApi';

/** Every Garmin activity, whether synced or picked as a file, is stored under this one source. */
const SOURCE = 'garmin-fit';
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back a sync looks at least; it reaches further back when the last sync is older. */
const SYNC_WINDOW_DAYS = 90;
const PAGE_SIZE = 50;
/** Guards against an endless pagination loop if the API keeps returning full pages. */
const MAX_PAGES = 20;

export type GarminImportResult =
  | { status: 'imported'; label: string; activity: Omit<Activity, 'id'>; garminSport: string }
  | { status: 'skipped'; label: string }
  | { status: 'failed'; label: string; message: string };

export interface GarminSyncReport {
  /** Local date (YYYY-MM-DD) from which Garmin Connect was searched. */
  since: string;
  results: GarminImportResult[];
  /** Set when the sync stopped early; results up to that point are kept. */
  error?: string;
}

function failure(label: string, error: unknown): GarminImportResult {
  if (error instanceof FitImportError || error instanceof GarminApiError) {
    return { status: 'failed', label, message: error.message };
  }
  console.warn(`Garmin import failed for ${label}`, error);
  return { status: 'failed', label, message: 'Could not import this activity.' };
}

/** Parses FIT data (raw or zipped) and stores each activity not already in trailOS. */
async function storeFitData(bytes: Uint8Array, label: string): Promise<GarminImportResult[]> {
  const results: GarminImportResult[] = [];
  for (const payload of extractFitPayloads(bytes)) {
    try {
      const { activity, garminSport } = parseFitActivity(payload);
      if (await findActivityId(SOURCE, activity.startTime) !== null) {
        results.push({ status: 'skipped', label });
        continue;
      }
      await saveCompletedActivity(activity);
      results.push({ status: 'imported', label, activity, garminSport });
    } catch (error) {
      results.push(failure(label, error));
    }
  }
  return results;
}

/**
 * Imports a .fit (or Garmin Connect .zip) picked from the device — the fallback when syncing
 * isn't possible. Expects a copy in the app cache from the document picker; it is removed after.
 */
export async function importFitFile(uri: string, fileName: string): Promise<GarminImportResult[]> {
  const file = new File(uri);
  try {
    return await storeFitData(await file.bytes(), fileName);
  } catch (error) {
    return [failure(fileName, error)];
  } finally {
    try {
      file.delete();
    } catch {
      // The OS clears the cache eventually; a leftover copy is harmless.
    }
  }
}

const localDate = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

async function syncStartDate(now: Date): Promise<string> {
  const windowStart = new Date(now.getTime() - SYNC_WINDOW_DAYS * DAY_MS);
  const latest = await getLatestActivityStart(SOURCE);
  // A day of overlap covers time zones, since Garmin filters by the activity's local date.
  const sinceLatest = latest && new Date(latest.getTime() - DAY_MS);
  return localDate(sinceLatest && sinceLatest < windowStart ? sinceLatest : windowStart);
}

const summaryLabel = (summary: GarminActivitySummary) =>
  summary.activityName?.trim() || `Garmin activity ${summary.activityId}`;

async function syncActivity(api: GarminPersonalApi, summary: GarminActivitySummary) {
  const label = summaryLabel(summary);
  // Skip the download when the start time already matches a stored activity.
  if (summary.beginTimestamp !== undefined
    && await findActivityId(SOURCE, new Date(summary.beginTimestamp)) !== null) {
    return [{ status: 'skipped', label } as const];
  }
  return storeFitData(await api.downloadActivityFile(summary.activityId), label);
}

/** Downloads recent Garmin Connect activities and stores the ones trailOS doesn't have yet. */
export async function syncGarminActivities(api: GarminPersonalApi): Promise<GarminSyncReport> {
  const since = await syncStartDate(new Date());
  const results: GarminImportResult[] = [];
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const summaries = await api.searchActivities(since, page * PAGE_SIZE, PAGE_SIZE);
      for (const summary of summaries) {
        try {
          results.push(...await syncActivity(api, summary));
        } catch (error) {
          if (error instanceof GarminApiError && error.blocksSync) throw error;
          results.push(failure(summaryLabel(summary), error));
        }
      }
      if (summaries.length < PAGE_SIZE) break;
    }
  } catch (error) {
    const message = error instanceof GarminApiError ? error.message : 'Sync stopped unexpectedly.';
    if (!(error instanceof GarminApiError)) console.warn('Garmin sync failed', error);
    return { since, results, error: message };
  }
  return { since, results };
}
