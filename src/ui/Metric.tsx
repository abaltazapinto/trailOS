import { StyleSheet, Text, View } from 'react-native';

import type { FormattedMetric, MetricUnit } from './format';
import { colors, spacing, typography } from './theme';

type MetricVariant = 'hero' | 'primary' | 'secondary';
type MetricColor = 'textPrimary' | 'textSecondary' | 'accent' | 'danger' | 'warning' | 'heartRate' | 'elevation';

interface MetricProps extends FormattedMetric {
  label: string;
  variant?: MetricVariant;
  color?: MetricColor;
  accessibilityLabel?: string;
}

const valueStyles = {
  hero: typography.metricHero,
  primary: typography.metricPrimary,
  secondary: typography.metricSecondary,
};

const unitStyles = {
  hero: typography.title,
  primary: typography.body,
  secondary: typography.caption,
};

const spokenUnits: Record<MetricUnit, string> = {
  km: 'kilometers',
  'h:m:s': 'hours, minutes, seconds',
  '/km': 'minutes per kilometer',
  'km/h': 'kilometers per hour',
  bpm: 'beats per minute',
  m: 'meters',
};

function metricMeaning(label: string, value: string, unit: MetricUnit): string {
  if (value === '--') return `${label}, unavailable, ${spokenUnits[unit]}`;
  if (unit === 'h:m:s') {
    const parts = value.split(':').map(Number);
    const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, ...parts];
    return `${label}, ${hours > 0 ? `${hours} hours, ` : ''}${minutes} minutes, ${seconds} seconds`;
  }
  if (unit === '/km') {
    const [minutes, seconds] = value.split(':').map(Number);
    return `${label}, ${minutes} minutes, ${seconds} seconds per kilometer`;
  }
  return `${label}, ${value} ${spokenUnits[unit]}`;
}

export default function Metric({
  label,
  value,
  unit,
  variant = 'primary',
  color = 'textPrimary',
  accessibilityLabel,
}: MetricProps) {
  const maxFontSizeMultiplier = variant === 'secondary' ? undefined : 1.3;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? metricMeaning(label, value, unit)}
      style={styles.metric}
    >
      <Text style={styles.label}>{label}</Text>
      <Text
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        style={[valueStyles[variant], { color: colors[color] }]}
      >
        {value}
        {/* A clock value (h:m:s) is self-describing; only physical units follow the value. */}
        {unit !== 'h:m:s' && (
          <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={[unitStyles[variant], styles.unit]}>
            {' '}{unit}
          </Text>
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metric: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  unit: { color: colors.textSecondary },
});
