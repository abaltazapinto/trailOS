import type { TextStyle } from 'react-native';

export const colors = {
  bg: '#0D1110',
  surface: '#151B18',
  surfaceRaised: '#1D2521',
  border: '#2B3530',
  textPrimary: '#F0F4F1',
  textSecondary: '#A9B5AE',
  textMuted: '#8A978F',
  accent: '#B7F34A',
  onAccent: '#0D1110',
  danger: '#FF6B5E',
  onDanger: '#0D1110',
  warning: '#F2B64C',
  onWarning: '#0D1110',
  heartRate: '#FF7A88',
  elevation: '#D9B77E',
} as const;

// Leave fontFamily unset to use each platform's system font.
export const typography = {
  metricHero: { fontSize: 72, lineHeight: 76, fontWeight: '700', fontVariant: ['tabular-nums'] },
  metricPrimary: { fontSize: 40, lineHeight: 44, fontWeight: '600', fontVariant: ['tabular-nums'] },
  metricSecondary: { fontSize: 28, lineHeight: 32, fontWeight: '600', fontVariant: ['tabular-nums'] },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} satisfies Record<string, TextStyle>;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;
