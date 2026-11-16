import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { useCurrentPosition } from '@maplibre/maplibre-react-native';

import RouteMap from '../components/RouteMap';
import type { Activity, GpsTrackPoint, Sport } from '../domain/activity';
import { calculateAverageSpeed, calculateDuration, calculateTrackDistance } from '../domain/activityMetrics';
import GarminCard from '../integrations/garmin/GarminCard';
import { saveCompletedActivity } from '../storage/activities';
import ActivityButton from '../ui/ActivityButton';
import { formatDistance, formatDuration, formatSpeedForSport, sportLabels } from '../ui/format';
import Metric from '../ui/Metric';
import { colors, radius, spacing, typography } from '../ui/theme';

type RecorderState = 'idle' | 'recording';

const sports = (Object.keys(sportLabels) as Sport[])
  .map((value) => ({ value, label: sportLabels[value] }));

export default function ActivityRecorderScreen() {
  const [sport, setSport] = useState<Sport>('hiking');
  const [state, setState] = useState<RecorderState>('idle');
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
  const averageSpeed = calculateAverageSpeed(distance, duration);
  // SPIKE (#8 phase A): temporary map preview with a test line near the user.
  // Replaced by the phase D layout.
  const spikePosition = useCurrentPosition({ enabled: permission?.granted === true });
  const spikeTrack = useMemo<GpsTrackPoint[]>(() => {
    if (!spikePosition) return [];
    const { latitude, longitude } = spikePosition.coords;
    const offset = 0.001; // degrees, about 110 m
    return [
      { latitude, longitude },
      { latitude: latitude + offset, longitude },
      { latitude: latitude + offset, longitude: longitude + offset },
    ];
  }, [spikePosition]);
  const metrics = [
    { label: 'Duration', ...formatDuration(duration) },
    { label: 'Distance', ...formatDistance(distance) },
    { label: sport === 'cycling' ? 'Average speed' : 'Average pace', ...formatSpeedForSport(averageSpeed, sport) },
  ];

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
    void persistActivity({
      source: 'phone-gps',
      sport,
      startTime: startedAt,
      endTime,
      duration: completedDuration,
      distance: completedDistance,
      averageSpeed: calculateAverageSpeed(completedDistance, completedDuration),
      trackPoints: pointsRef.current,
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

  const permissionMessage = permissionPending
    ? 'Checking location permission…'
    : permissionError ?? (
      permission?.granted
        ? 'Location permission granted.'
        : permission?.status === 'denied'
          ? permission.canAskAgain
            ? 'Location permission denied. Allow access to start an activity.'
            : 'Location permission denied. Enable location access in your device settings.'
          : 'Location permission is required to start an activity.'
    );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={styles.brand}>trailOS</Text>
      <Text style={styles.title}>Activity recorder</Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {isRecording ? 'Recording' : canStart ? 'Idle · Ready to start' : 'Idle'}
      </Text>

      <View style={styles.spikeMap}>
        <RouteMap
          track={isRecording ? trackPoints : spikeTrack}
          showUserLocation={permission?.granted === true}
          followUser
          style={StyleSheet.absoluteFill}
        />
      </View>

      <Text accessibilityLiveRegion="polite" style={styles.label}>
        {permissionMessage}
      </Text>
      {!permission?.granted && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: permissionPending || permission?.canAskAgain === false }}
          disabled={permissionPending || permission?.canAskAgain === false}
          onPress={() => void checkPermission(true)}
          style={({ pressed }) => [
            styles.permissionAction,
            (permissionPending || permission?.canAskAgain === false) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.sportText}>Allow location access</Text>
        </Pressable>
      )}

      <Text style={[styles.label, styles.sportLabel]}>Sport</Text>
      <View style={styles.sports}>
        {sports.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{
              selected: sport === option.value,
              disabled: isRecording,
            }}
            disabled={isRecording}
            onPress={() => setSport(option.value)}
            style={({ pressed }) => [
              styles.sport,
              sport === option.value && styles.selectedSport,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.sportText,
                sport === option.value && styles.selectedSportText,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.metrics}>
        {metrics.map((metric) => (
          <Metric key={metric.label} {...metric} />
        ))}
      </View>
      <Text style={styles.hint}>Recorded points: {trackPoints.length}</Text>
      {saveMessage && (
        <Text accessibilityLiveRegion="polite" style={styles.hint}>{saveMessage}</Text>
      )}
      {pendingActivity && !saving && (
        <Pressable
          accessibilityRole="button"
          onPress={() => void persistActivity(pendingActivity)}
          style={styles.permissionAction}
        >
          <Text style={styles.sportText}>Retry saving activity</Text>
        </Pressable>
      )}
      {recordingError && (
        <Text accessibilityRole="alert" style={styles.hint}>{recordingError}</Text>
      )}

      <ActivityButton
        label={isRecording ? 'Stop' : 'Start'}
        variant={isRecording ? 'danger' : 'primary'}
        accessibilityLabel={isRecording ? 'Stop activity' : 'Start activity'}
        disabled={!isRecording && !canStart}
        onPress={() => {
          if (isRecording) finishRecording();
          else if (canStart) void checkPermission(false, true);
        }}
        style={styles.action}
      />

      <GarminCard disabled={isRecording || saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl * 2, paddingBottom: spacing.xl * 2 },
  brand: { ...typography.body, color: colors.accent, fontWeight: '700', marginBottom: spacing.md },
  title: { ...typography.title, color: colors.textPrimary },
  status: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xxl },
  label: { ...typography.body, color: colors.textSecondary },
  sportLabel: { marginTop: spacing.xl },
  permissionAction: { minHeight: 48, paddingVertical: spacing.md, justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  sports: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  sport: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    justifyContent: 'center',
  },
  selectedSport: { backgroundColor: colors.accent, borderColor: colors.accent },
  sportText: { ...typography.body, color: colors.accent, fontWeight: '600' },
  selectedSportText: { color: colors.onAccent },
  metrics: { marginTop: spacing.xxl, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.xl },
  hint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md },
  action: { marginTop: spacing.xxl },
  spikeMap: { height: 280, borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.xl },
  pressed: { opacity: 0.75 },
});
