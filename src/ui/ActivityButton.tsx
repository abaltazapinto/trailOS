import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from './theme';

interface ActivityButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export default function ActivityButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityLabel = label,
  style,
}: ActivityButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        style,
        styles.button,
        styles[variant],
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, labelStyles[variant], disabled && styles.disabledLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  secondary: { backgroundColor: colors.surface, borderColor: colors.border },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
  label: { ...typography.body, fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: 0.75 },
  disabled: { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
  disabledLabel: { color: colors.textMuted },
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.onAccent },
  secondary: { color: colors.textPrimary },
  danger: { color: colors.onDanger },
});
