import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatPace,
  formatSpeed,
  formatSpeedForSport,
} from '../format';

const unavailableInputs = [undefined, null, NaN, Infinity, -Infinity];

describe('unavailable readings', () => {
  test.each(unavailableInputs)('preserves the unit for %s', (input) => {
    expect(formatDistance(input)).toEqual({ value: '--', unit: 'km' });
    expect(formatDuration(input)).toEqual({ value: '--', unit: 'h:m:s' });
    expect(formatPace(input)).toEqual({ value: '--', unit: '/km' });
    expect(formatSpeed(input)).toEqual({ value: '--', unit: 'km/h' });
    expect(formatHeartRate(input)).toEqual({ value: '--', unit: 'bpm' });
    expect(formatElevation(input)).toEqual({ value: '--', unit: 'm' });
  });

  test('rejects negative distance, duration and speed', () => {
    expect(formatDistance(-1)).toEqual({ value: '--', unit: 'km' });
    expect(formatDuration(-1)).toEqual({ value: '--', unit: 'h:m:s' });
    expect(formatSpeed(-1)).toEqual({ value: '--', unit: 'km/h' });
  });

  test('does not expose arithmetic overflow', () => {
    expect(formatPace(Number.MIN_VALUE)).toEqual({ value: '--', unit: '/km' });
    expect(formatSpeed(Number.MAX_VALUE)).toEqual({ value: '--', unit: 'km/h' });
    expect(formatDuration(Number.MAX_VALUE)).toEqual({ value: '--', unit: 'h:m:s' });
  });
});

test('formats distance in kilometers with two decimal places', () => {
  expect(formatDistance(5240)).toEqual({ value: '5.24', unit: 'km' });
  expect(formatDistance(0)).toEqual({ value: '0.00', unit: 'km' });
});

test('formats elapsed seconds compactly, without rounding up or wrapping at 24 hours', () => {
  expect(formatDuration(0)).toEqual({ value: '0:00', unit: 'h:m:s' });
  expect(formatDuration(59.9)).toEqual({ value: '0:59', unit: 'h:m:s' });
  expect(formatDuration(3599)).toEqual({ value: '59:59', unit: 'h:m:s' });
  expect(formatDuration(3600)).toEqual({ value: '1:00:00', unit: 'h:m:s' });
  expect(formatDuration(3661)).toEqual({ value: '1:01:01', unit: 'h:m:s' });
  expect(formatDuration(90061)).toEqual({ value: '25:01:01', unit: 'h:m:s' });
});

describe('pace', () => {
  test.each([0, -1])('has no pace for %s m/s', (input) => {
    expect(formatPace(input)).toEqual({ value: '--', unit: '/km' });
  });

  test('converts meters/second to minutes:seconds per kilometer', () => {
    expect(formatPace(3)).toEqual({ value: '5:33', unit: '/km' });
  });

  test('carries rounded seconds into minutes instead of displaying :60', () => {
    expect(formatPace(1000 / 359.6)).toEqual({ value: '6:00', unit: '/km' });
    expect(formatPace(1000 / 359.4)).toEqual({ value: '5:59', unit: '/km' });
    expect(formatPace(1000 / 59.6)).toEqual({ value: '1:00', unit: '/km' });
  });

  test('treats paces slower than 59:59 /km as unavailable', () => {
    expect(formatPace(1000 / 3599)).toEqual({ value: '59:59', unit: '/km' });
    expect(formatPace(1000 / 3600)).toEqual({ value: '--', unit: '/km' });
    expect(formatPace(5 / 600)).toEqual({ value: '--', unit: '/km' });
  });
});

test('formats meters/second in kilometers/hour', () => {
  expect(formatSpeed(10)).toEqual({ value: '36.0', unit: 'km/h' });
  expect(formatSpeed(0)).toEqual({ value: '0.0', unit: 'km/h' });
});

describe('heart rate', () => {
  test.each([0, -1, 0.1])('never displays a fake zero for %s bpm', (input) => {
    expect(formatHeartRate(input)).toEqual({ value: '--', unit: 'bpm' });
  });

  test('rounds valid readings to whole bpm', () => {
    expect(formatHeartRate(147.6)).toEqual({ value: '148', unit: 'bpm' });
  });
});

test('formats elevation in whole meters, including below sea level', () => {
  expect(formatElevation(1234.6)).toEqual({ value: '1235', unit: 'm' });
  expect(formatElevation(0)).toEqual({ value: '0', unit: 'm' });
  expect(formatElevation(-12.6)).toEqual({ value: '-13', unit: 'm' });
});

describe('sport-specific speed display', () => {
  test('cycling uses speed', () => {
    expect(formatSpeedForSport(10, 'cycling')).toEqual({ value: '36.0', unit: 'km/h' });
    expect(formatSpeedForSport(undefined, 'cycling')).toEqual({ value: '--', unit: 'km/h' });
  });

  test.each(['hiking', 'running'] as const)('%s uses pace', (sport) => {
    expect(formatSpeedForSport(3, sport)).toEqual({ value: '5:33', unit: '/km' });
    expect(formatSpeedForSport(0, sport)).toEqual({ value: '--', unit: '/km' });
  });
});
