import { colors } from '../theme';

// WCAG relative luminance for the opaque sRGB tokens used by the app.
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const backgrounds = ['bg', 'surface', 'surfaceRaised'] as const;
const textColors = [
  'textPrimary', 'textSecondary', 'textMuted',
  'accent', 'danger', 'warning', 'heartRate', 'elevation',
] as const;

describe('readable text on dark surfaces', () => {
  test.each(textColors.flatMap((foreground) => backgrounds.map((background) => [foreground, background] as const)))(
    '%s on %s meets 4.5:1 contrast',
    (foreground, background) => {
      expect(contrast(colors[foreground], colors[background])).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe('text on semantic fills', () => {
  test.each([
    ['onAccent', 'accent'],
    ['onDanger', 'danger'],
    ['onWarning', 'warning'],
  ] as const)('%s on %s meets 4.5:1 contrast', (foreground, background) => {
    expect(contrast(colors[foreground], colors[background])).toBeGreaterThanOrEqual(4.5);
  });
});
