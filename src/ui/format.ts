import type { Sport } from '../domain/activity';

export const sportLabels: Record<Sport, string> = {
  hiking: 'Hiking',
  running: 'Running',
  cycling: 'Cycling',
};

/** Formats seconds as HH:MM:SS. */
export function formatDuration(duration: number): string {
  const seconds = Math.floor(duration);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, '0')).join(':');
}

/** Formats meters as kilometers with two decimals. */
export const formatDistance = (meters: number) => `${(meters / 1000).toFixed(2)} km`;
