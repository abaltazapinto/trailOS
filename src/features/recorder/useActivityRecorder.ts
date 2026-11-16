import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';

import type { Activity, GpsTrackPoint, Sport } from '../../domain/activity';
import {
  calculateAverageSpeed,
  calculateDuration,
  calculateElevationGain,
  calculateTrackDistance,
} from '../../domain/activityMetrics';
import { saveCompletedActivity } from '../../storage/activities';

/** Foreground location permission, reduced to what the Recorder UI needs. */
export type PermissionStatus =
  | 'checking'
  | 'unavailable'
  | 'granted'
  | 'denied'
  | 'blocked'
  | 'undetermined';

export interface RecorderPermission {
  status: PermissionStatus;
  /** Last known grant; stays true while a granted permission is re-checked. */
  granted: boolean;
  /** Whether asking again can show the system prompt. */
  canRequest: boolean;
  /** Message shown when the permission check itself failed. */
  error: string | null;
}

/**
 * Recorder state machine: foreground location permission, GPS watcher, timer,
 * live metrics and local persistence with retry. Values are canonical SI units.
 */
export function useActivityRecorder() {
  const [sport, setSport] = useState<Sport>('hiking');
  const [state, setState] = useState<'idle' | 'recording'>('idle');
  const [trackPoints, setTrackPoints] = useState<GpsTrackPoint[]>([]);
  const pointsRef = useRef<GpsTrackPoint[]>([]);
  const watcherReady = useRef(false);
  const [pendingActivity, setPendingActivity] = useState<Omit<Activity, 'id'> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const saveBusy = useRef(false);
  const [duration, setDuration] = useState(0);
  const startTime = useRef<Date | null>(null);
  const stopWatching = useRef<(() => void) | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [permission, setPermission] = useState<Location.LocationPermissionResponse | null>(null);
  const [permissionPending, setPermissionPending] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const permissionBusy = useRef(false);
  const isRecording = state === 'recording';
  const canStart = permission?.granted === true && !permissionPending && !permissionError
    && !saving && !pendingActivity;
  const distance = useMemo(() => calculateTrackDistance(trackPoints), [trackPoints]);
  const elevationGain = useMemo(() => calculateElevationGain(trackPoints), [trackPoints]);
  const averageSpeed = calculateAverageSpeed(distance, duration);

  const stopRecording = useCallback(() => {
    stopWatching.current?.();
    if (startTime.current) {
      setDuration(calculateDuration(startTime.current, new Date()));
      startTime.current = null;
    }
    setState('idle');
  }, []);

  const persistActivity = async (activity: Omit<Activity, 'id'>) => {
    if (saveBusy.current) return;
    saveBusy.current = true;
    setSaving(true);
    setPendingActivity(activity);
    setSaveMessage('Saving activity…');
    try {
      await saveCompletedActivity(activity);
      setPendingActivity(null);
      setSaveMessage('Activity saved on this device.');
    } catch {
      setSaveMessage('Could not save activity. Please retry before starting another activity.');
    } finally {
      saveBusy.current = false;
      setSaving(false);
    }
  };

  const finishRecording = () => {
    const startedAt = startTime.current;
    const ready = watcherReady.current;
    const endTime = new Date();
    stopRecording();
    if (!startedAt || !ready) {
      setSaveMessage('GPS was not ready. Activity was not saved.');
      return;
    }
    const completedDuration = calculateDuration(startedAt, endTime);
    const completedDistance = calculateTrackDistance(pointsRef.current);
    const completedElevationGain = calculateElevationGain(pointsRef.current);
    void persistActivity({
      source: 'phone-gps',
      sport,
      startTime: startedAt,
      endTime,
      duration: completedDuration,
      distance: completedDistance,
      averageSpeed: calculateAverageSpeed(completedDistance, completedDuration),
      trackPoints: pointsRef.current,
      ...(completedElevationGain !== undefined ? { elevationGain: completedElevationGain } : {}),
    });
  };

  const checkPermission = useCallback(async (request = false, start = false) => {
    if (permissionBusy.current) return;
    permissionBusy.current = true;
    setPermissionPending(true);
    setPermissionError(null);
    try {
      const result = request
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();
      setPermission(result);
      if (!result.granted) stopRecording();
      else if (start) {
        pointsRef.current = [];
        watcherReady.current = false;
        setTrackPoints([]);
        setDuration(0);
        startTime.current = new Date();
        setRecordingError(null);
        setSaveMessage(null);
        setState('recording');
      }
    } catch {
      setPermission(null);
      stopRecording();
      setPermissionError('Location permission is unavailable. Please try again.');
    } finally {
      permissionBusy.current = false;
      setPermissionPending(false);
    }
  }, [stopRecording]);

  useEffect(() => {
    void checkPermission();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void checkPermission();
    });
    return () => subscription.remove();
  }, [checkPermission]);

  useEffect(() => {
    if (!isRecording) return;
    let active = true;
    const timer = setInterval(() => {
      if (active && startTime.current) {
        setDuration(calculateDuration(startTime.current, new Date()));
      }
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) return;

    let active = true;
    let subscription: Location.LocationSubscription | undefined;

    const cleanup = () => {
      active = false;
      watcherReady.current = false;
      subscription?.remove();
      subscription = undefined;
      if (stopWatching.current === cleanup) stopWatching.current = null;
    };
    stopWatching.current = cleanup;
    const handleError = () => {
      if (!active) return;
      cleanup();
      setRecordingError('GPS recording stopped. Check location services and try again.');
      stopRecording();
    };

    const startWatching = async () => {
      try {
        const watcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 1 },
          (location) => {
            if (!active) return;
            const point: GpsTrackPoint = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              timestamp: new Date(location.timestamp),
              ...(location.coords.altitude != null ? { elevation: location.coords.altitude } : {}),
            };
            pointsRef.current = [...pointsRef.current, point];
            setTrackPoints(pointsRef.current);
          },
          handleError,
        );
        // Stop may happen before the asynchronous watcher setup finishes.
        if (!active) watcher.remove();
        else {
          subscription = watcher;
          watcherReady.current = true;
        }
      } catch {
        handleError();
      }
    };

    void startWatching();
    return cleanup;
  }, [isRecording, stopRecording]);

  const permissionStatus: PermissionStatus = permissionPending
    ? 'checking'
    : permissionError
      ? 'unavailable'
      : permission?.granted
        ? 'granted'
        : permission?.status === 'denied'
          ? permission.canAskAgain ? 'denied' : 'blocked'
          : 'undetermined';

  return {
    sport,
    /** Ignored while recording: the sport is locked for the activity. */
    selectSport: (next: Sport) => {
      if (!isRecording) setSport(next);
    },
    isRecording,
    canStart,
    start: () => {
      if (canStart) void checkPermission(false, true);
    },
    stop: finishRecording,
    permission: {
      status: permissionStatus,
      granted: permission?.granted === true,
      canRequest: !permissionPending && permission?.canAskAgain !== false,
      error: permissionError,
    } satisfies RecorderPermission,
    requestPermission: () => void checkPermission(true),
    trackPoints,
    /** True once points arrive from the GPS watcher during a recording. */
    hasGpsFix: trackPoints.length > 0,
    duration,
    distance,
    averageSpeed,
    elevationGain,
    saving,
    saveMessage,
    canRetrySave: pendingActivity !== null && !saving,
    retrySave: () => {
      if (pendingActivity) void persistActivity(pendingActivity);
    },
    recordingError,
  };
}
