import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import RouteMap from '../../components/RouteMap';
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatSpeedForSport,
  sportLabels,
} from '../../ui/format';
import Metric from '../../ui/Metric';
import { colors, radius, spacing, typography } from '../../ui/theme';
import RecorderControls from './RecorderControls';
import SportPicker from './SportPicker';
import { type RecorderPermission, useActivityRecorder } from './useActivityRecorder';

const NO_TRACK = [] as const;

export default function RecorderScreen() {
  const recorder = useActivityRecorder();
  const { isRecording, permission, sport } = recorder;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.brand}>trailOS</Text>
        {isRecording ? (
          <View style={styles.chips}>
            <Text style={[styles.chip, styles.recordingChip]}>● REC · {sportLabels[sport]}</Text>
            <Text accessibilityLiveRegion="polite" style={[styles.chip, recorder.hasGpsFix && styles.gpsChip]}>
              {recorder.hasGpsFix ? 'GPS' : 'Waiting for GPS…'}
            </Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Garmin sync and import"
            accessibilityState={{ disabled: recorder.saving }}
            disabled={recorder.saving}
            onPress={() => router.push('/garmin')}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed, recorder.saving && styles.disabled]}
          >
            <Text style={styles.headerActionText}>Garmin</Text>
          </Pressable>
        )}
      </View>

      {isRecording ? (
        <>
          <Metric
            variant="hero"
            label={sport === 'cycling' ? 'Average speed' : 'Average pace'}
            {...formatSpeedForSport(recorder.averageSpeed, sport)}
          />
          <View style={styles.row}>
            <View style={styles.cell}><Metric label="Distance" {...formatDistance(recorder.distance)} /></View>
            <View style={styles.cell}><Metric label="Time" {...formatDuration(recorder.duration)} /></View>
          </View>
          <View style={styles.map}>
            <RouteMap track={recorder.trackPoints} showUserLocation followUser style={StyleSheet.absoluteFill} />
          </View>
          <View style={styles.row}>
            <View style={styles.cell}>
              {/* Phone recordings have no heart-rate source. */}
              <Metric variant="secondary" color="heartRate" label="Heart rate" {...formatHeartRate(undefined)} />
            </View>
            <View style={styles.cell}>
              <Metric
                variant="secondary"
                color="elevation"
                label="Elevation gain"
                {...formatElevation(recorder.elevationGain)}
              />
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={styles.map}>
            {permission.granted ? (
              <RouteMap track={NO_TRACK} showUserLocation followUser style={StyleSheet.absoluteFill} />
            ) : (
              <PermissionPanel permission={permission} onRequest={recorder.requestPermission} />
            )}
          </View>
          <View style={styles.status}>
            <View style={[styles.dot, recorder.canStart && styles.readyDot]} />
            <Text accessibilityLiveRegion="polite" style={styles.statusText}>
              {statusMessage(permission, recorder.canStart)}
            </Text>
          </View>
          <SportPicker value={sport} onChange={recorder.selectSport} disabled={isRecording} />
          {recorder.saveMessage && (
            <Text accessibilityLiveRegion="polite" style={styles.message}>{recorder.saveMessage}</Text>
          )}
          {recorder.canRetrySave && (
            <Pressable accessibilityRole="button" onPress={recorder.retrySave} style={styles.link}>
              <Text style={styles.linkText}>Retry saving activity</Text>
            </Pressable>
          )}
          {recorder.recordingError && (
            <Text accessibilityRole="alert" style={[styles.message, styles.error]}>{recorder.recordingError}</Text>
          )}
        </>
      )}

      <RecorderControls
        isRecording={isRecording}
        canStart={recorder.canStart}
        onStart={recorder.start}
        onStop={recorder.stop}
      />
    </SafeAreaView>
  );
}

function PermissionPanel({ permission, onRequest }: { permission: RecorderPermission; onRequest: () => void }) {
  return (
    <View style={styles.permission}>
      <Text style={styles.permissionTitle}>Location needed</Text>
      <Text style={styles.message}>trailOS uses GPS while the app is open to record your route.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !permission.canRequest }}
        disabled={!permission.canRequest}
        onPress={onRequest}
        style={({ pressed }) => [styles.link, pressed && styles.pressed, !permission.canRequest && styles.disabled]}
      >
        <Text style={styles.linkText}>Allow location access</Text>
      </Pressable>
    </View>
  );
}

function statusMessage(permission: RecorderPermission, canStart: boolean): string {
  switch (permission.status) {
    case 'checking': return 'Checking location permission…';
    case 'unavailable': return permission.error ?? 'Location permission is unavailable. Please try again.';
    case 'granted': return canStart ? 'Ready to record' : 'Location permission granted.';
    case 'denied': return 'Location permission denied. Allow access to start an activity.';
    case 'blocked': return 'Location permission denied. Enable location access in your device settings.';
    case 'undetermined': return 'Location permission is required to start an activity.';
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { ...typography.title, color: colors.accent },
  headerAction: { minHeight: 48, paddingHorizontal: spacing.md, justifyContent: 'center' },
  headerActionText: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    overflow: 'hidden',
  },
  recordingChip: { color: colors.danger },
  gpsChip: { color: colors.accent },
  row: { flexDirection: 'row', gap: spacing.md },
  cell: { flex: 1 },
  map: { flex: 1, minHeight: 120, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: spacing.sm, height: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.textMuted },
  readyDot: { backgroundColor: colors.accent },
  statusText: { ...typography.body, color: colors.textSecondary, flexShrink: 1 },
  message: { ...typography.caption, color: colors.textSecondary },
  error: { color: colors.danger },
  permission: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  permissionTitle: { ...typography.title, color: colors.textPrimary },
  link: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { ...typography.body, fontWeight: '600', color: colors.accent },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
});
