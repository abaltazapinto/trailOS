import { useEffect, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';

import ActivityButton from '../../ui/ActivityButton';
import { colors, radius, spacing, typography } from '../../ui/theme';

const HOLD_TO_STOP_MS = 1000;

interface RecorderControlsProps {
  isRecording: boolean;
  canStart: boolean;
  onStart: () => void;
  onStop: () => void;
}

/** Start while idle; hold-to-stop while recording (a confirmation with a screen reader). */
export default function RecorderControls({ isRecording, canStart, onStart, onStop }: RecorderControlsProps) {
  const screenReader = useScreenReaderEnabled();
  if (!isRecording) {
    return (
      <ActivityButton label="Start" accessibilityLabel="Start activity" disabled={!canStart} onPress={onStart} />
    );
  }
  return <StopButton confirm={screenReader} onStop={onStop} />;
}

function StopButton({ confirm, onStop }: { confirm: boolean; onStop: () => void }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => () => progress.stopAnimation(), [progress]);

  const beginHold = () => {
    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_TO_STOP_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      progress.setValue(0);
      onStop();
    });
  };

  const cancelHold = () => {
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: true }).start();
  };

  const askToStop = () => Alert.alert('Stop activity?', 'The activity will be saved on this device.', [
    { text: 'Keep recording', style: 'cancel' },
    { text: 'Stop', style: 'destructive', onPress: onStop },
  ]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Stop activity"
      accessibilityHint={confirm ? 'Asks for confirmation, then saves the activity' : 'Hold for one second to stop'}
      onPress={confirm ? askToStop : undefined}
      onPressIn={confirm ? undefined : beginHold}
      onPressOut={confirm ? undefined : cancelHold}
      style={styles.stop}
    >
      <Animated.View pointerEvents="none" style={[styles.fill, { transform: [{ scaleX: progress }] }]} />
      <Text style={styles.label}>{confirm ? 'Stop' : 'Hold to stop'}</Text>
    </Pressable>
  );
}

function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (active) setEnabled(value);
    });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}

const styles = StyleSheet.create({
  stop: {
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.onDanger,
    opacity: 0.3,
    transformOrigin: 'left',
  },
  label: { ...typography.body, fontWeight: '700', color: colors.onDanger },
});
