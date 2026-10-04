export type ActivitySource = 'phone-gps' | 'garmin-fit' | 'gpx-import';

export type Sport = 'hiking' | 'running' | 'cycling';

/** A source-independent position in an activity's ordered GPS track. */
export interface GpsTrackPoint {
  /** Latitude in decimal degrees. */
  latitude: number;
  /** Longitude in decimal degrees. */
  longitude: number;
  /** Time of the sample; imported tracks may omit timestamps. */
  timestamp?: Date;
  /** Elevation in meters above sea level. */
  elevation?: number;
  /** Heart rate in beats per minute. */
  heartRate?: number;
}

export interface Activity {
  id: string;
  source: ActivitySource;
  sport: Sport;
  startTime: Date;
  /** Absent while the activity is in progress. */
  endTime?: Date;
  /** Duration in seconds. */
  duration: number;
  /** Distance in meters. */
  distance: number;
  /** Average speed in meters per second. */
  averageSpeed: number;
  /** Track points in traversal order. */
  trackPoints: GpsTrackPoint[];
  /** Total elevation gained in meters, when available. */
  elevationGain?: number;
}
