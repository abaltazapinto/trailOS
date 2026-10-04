import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';

import type { GpsTrackPoint, Sport } from '../domain/activity';
import { calculateAverageSpeed, calculateDuration, calculateTrackDistance } from '../domain/activityMetrics';

type RecorderState = 'idle' | 'recording';

const sports: { value: Sport; label: string }[] = [
  { value: 'hiking', label: 'Hiking' },
  { value: 'running', label: 'Running' },
  { value: 'cycling', label: 'Cycling' },
];

function formatDuration(duration: number): string {
  const seconds = Math.floor(duration);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, '0')).join(':');
}

export default function ActivityRecorderScreen() {
  const [sport, setSport] = useState<Sport>('hiking');
  const [state, setState] = useState<RecorderState>('idle');
  const [trackPoints, setTrackPoints] = useState<GpsTrackPoint[]>([]);
  const [duration, setDuration] = useState(0);
  const startTime = useRef<Date | null>(null);
  const stopWatching = useRef<(() => void) | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [permission, setPermission] = useState<Location.LocationPermissionResponse | null>(null);
  const [permissionPending, setPermissionPending] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const permissionBusy = useRef(false);
  const isRecording = state === 'recording';
  const canStart = permission?.granted === true && !permissionPending && !permissionError;
  const distance = useMemo(() => calculateTrackDistance(trackPoints), [trackPoints]);
  const averageSpeed = calculateAverageSpeed(distance, duration);
  const metrics = [
    { label: 'Duration', value: formatDuration(duration) },
    { label: 'Distance', value: `${(distance / 1000).toFixed(2)} km` },
    { label: 'Average speed', value: `${(averageSpeed * 3.6).toFixed(1)} km/h` },
  ];

  const stopRecording = useCallback(() => {
    stopWatching.current?.();
    if (startTime.current) {
      setDuration(calculateDuration(startTime.current, new Date()));
      startTime.current = null;
    }
    setState('idle');
  }, []);

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
        setTrackPoints([]);
        setDuration(0);
        startTime.current = new Date();
        setRecordingError(null);
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
            setTrackPoints((previous) => [...previous, point]);
          },
          handleError,
        );
        // Stop may happen before the asynchronous watcher setup finishes.
        if (!active) watcher.remove();
        else subscription = watcher;
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
          <View key={metric.label} style={styles.metric}>
            <Text style={styles.label}>{metric.label}</Text>
            <Text style={styles.metricValue}>{metric.value}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.hint}>Recorded points: {trackPoints.length}</Text>
      {recordingError && (
        <Text accessibilityRole="alert" style={styles.hint}>{recordingError}</Text>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isRecording ? 'Stop activity' : 'Start activity'}
        accessibilityState={{ disabled: !isRecording && !canStart }}
        disabled={!isRecording && !canStart}
        onPress={() => {
          if (isRecording) stopRecording();
          else if (canStart) void checkPermission(false, true);
        }}
        style={({ pressed }) => [
          styles.action,
          isRecording && styles.stopAction,
          !isRecording && !canStart && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.actionText}>{isRecording ? 'Stop' : 'Start'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f7f3' },
  content: { paddingHorizontal: 24, paddingTop: 64, paddingBottom: 48 },
  brand: { color: '#346345', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  title: { color: '#18271e', fontSize: 30, fontWeight: '700' },
  status: { color: '#46574b', fontSize: 16, marginTop: 12, marginBottom: 32 },
  label: { color: '#46574b', fontSize: 16 },
  sportLabel: { marginTop: 24 },
  permissionAction: { minHeight: 48, paddingVertical: 12, justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  sports: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  sport: {
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#63786a',
    borderRadius: 12,
    justifyContent: 'center',
  },
  selectedSport: { backgroundColor: '#28563a', borderColor: '#28563a' },
  sportText: { color: '#28563a', fontSize: 16, fontWeight: '600' },
  selectedSportText: { color: '#fff' },
  metrics: { marginTop: 32, backgroundColor: '#fff', borderRadius: 16, padding: 24, gap: 24 },
  metric: { gap: 6 },
  metricValue: { color: '#18271e', fontSize: 28, fontWeight: '600' },
  hint: { color: '#46574b', fontSize: 14, marginTop: 12 },
  action: {
    backgroundColor: '#28563a',
    minHeight: 56,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  stopAction: { backgroundColor: '#a13232' },
  actionText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
