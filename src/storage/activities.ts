import * as SQLite from 'expo-sqlite';

import type { Activity, GpsTrackPoint } from '../domain/activity';

let database: Promise<SQLite.SQLiteDatabase> | undefined;

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('trailos.db');
  try {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY NOT NULL,
        source TEXT NOT NULL,
        sport TEXT NOT NULL,
        startTime TEXT NOT NULL,
        endTime TEXT NOT NULL,
        duration REAL NOT NULL,
        distance REAL NOT NULL,
        averageSpeed REAL NOT NULL,
        elevationGain REAL
      );
      CREATE TABLE IF NOT EXISTS track_points (
        activityId TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        pointIndex INTEGER NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        timestamp TEXT,
        elevation REAL,
        heartRate REAL,
        PRIMARY KEY (activityId, pointIndex)
      );
    `);
    return db;
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}

function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  database ??= openDatabase().catch((error) => {
    database = undefined;
    throw error;
  });
  return database;
}

/** Saves a completed activity atomically; dates are stored as ISO strings. */
export async function saveCompletedActivity(activity: Omit<Activity, 'id'>): Promise<string> {
  if (!activity.endTime) throw new Error('Only completed activities can be saved.');
  const endTime = activity.endTime.toISOString();
  const db = await getDatabase();
  let id = '';
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const row = await transaction.getFirstAsync<{ id: string }>(
      'SELECT lower(hex(randomblob(16))) AS id',
    );
    if (!row) throw new Error('Could not create an activity ID.');
    id = row.id;
    await transaction.runAsync(
      `INSERT INTO activities
       (id, source, sport, startTime, endTime, duration, distance, averageSpeed, elevationGain)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, activity.source, activity.sport, activity.startTime.toISOString(), endTime,
      activity.duration, activity.distance, activity.averageSpeed, activity.elevationGain ?? null,
    );
    const statement = await transaction.prepareAsync(
      `INSERT INTO track_points
       (activityId, pointIndex, latitude, longitude, timestamp, elevation, heartRate)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    try {
      for (const [index, point] of activity.trackPoints.entries()) {
        await statement.executeAsync(
          id, index, point.latitude, point.longitude, point.timestamp?.toISOString() ?? null,
          point.elevation ?? null, point.heartRate ?? null,
        );
      }
    } finally {
      await statement.finalizeAsync();
    }
  });
  return id;
}

type ActivityRow = Omit<Activity, 'startTime' | 'endTime' | 'trackPoints' | 'elevationGain'> & {
  startTime: string;
  endTime: string;
  elevationGain: number | null;
};

type TrackPointRow = Pick<GpsTrackPoint, 'latitude' | 'longitude'> & {
  timestamp: string | null;
  elevation: number | null;
  heartRate: number | null;
};

/** Reads persisted data from SQLite, preserving track order and optional values. */
export async function getActivity(id: string): Promise<Activity | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ActivityRow>('SELECT * FROM activities WHERE id = ?', id);
  if (!row) return null;
  const points = await db.getAllAsync<TrackPointRow>(
    `SELECT latitude, longitude, timestamp, elevation, heartRate
     FROM track_points WHERE activityId = ? ORDER BY pointIndex`, id,
  );
  return {
    ...row,
    startTime: new Date(row.startTime),
    endTime: new Date(row.endTime),
    elevationGain: row.elevationGain ?? undefined,
    trackPoints: points.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      timestamp: point.timestamp === null ? undefined : new Date(point.timestamp),
      elevation: point.elevation ?? undefined,
      heartRate: point.heartRate ?? undefined,
    })),
  };
}
