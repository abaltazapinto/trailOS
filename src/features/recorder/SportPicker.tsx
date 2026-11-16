import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Sport } from '../../domain/activity';
import { sportLabels } from '../../ui/format';
import { colors, radius, spacing, typography } from '../../ui/theme';

const sports = Object.keys(sportLabels) as Sport[];

interface SportPickerProps {
  value: Sport;
  onChange: (sport: Sport) => void;
  disabled: boolean;
}

/** Segmented Hiking / Running / Cycling selector. */
export default function SportPicker({ value, onChange, disabled }: SportPickerProps) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Sport" style={styles.group}>
      {sports.map((sport) => {
        const selected = sport === value;
        return (
          <Pressable
            key={sport}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(sport)}
            style={({ pressed }) => [
              styles.option,
              selected && styles.selected,
              pressed && !selected && styles.pressed,
              disabled && !selected && styles.disabled,
            ]}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]}>{sportLabels[sport]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  option: { flex: 1, minHeight: 48, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.accent },
  pressed: { backgroundColor: colors.surfaceRaised },
  disabled: { opacity: 0.5 },
  label: { ...typography.body, fontWeight: '600', color: colors.textSecondary },
  selectedLabel: { color: colors.onAccent },
});
