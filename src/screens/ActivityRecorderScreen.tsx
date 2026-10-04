import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Sport } from '../domain/activity';

type RecorderState = 'idle' | 'recording';

const sports: { value: Sport; label: string }[] = [
  { value: 'hiking', label: 'Hiking' },
  { value: 'running', label: 'Running' },
  { value: 'cycling', label: 'Cycling' },
];

const metrics = [
  { label: 'Duration', value: '00:00:00' },
  { label: 'Distance', value: '0.00 km' },
  { label: 'Average speed', value: '0.0 km/h' },
];

export default function ActivityRecorderScreen() {
  const [sport, setSport] = useState<Sport>('hiking');
  const [state, setState] = useState<RecorderState>('idle');
  const isRecording = state === 'recording';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={styles.brand}>trailOS</Text>
      <Text style={styles.title}>Activity recorder</Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {isRecording ? 'Recording' : 'Idle · Ready to start'}
      </Text>

      <Text style={styles.label}>Sport</Text>
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
      <Text style={styles.hint}>Metrics are placeholders for now.</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isRecording ? 'Stop activity' : 'Start activity'}
        onPress={() => setState(isRecording ? 'idle' : 'recording')}
        style={({ pressed }) => [
          styles.action,
          isRecording && styles.stopAction,
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
