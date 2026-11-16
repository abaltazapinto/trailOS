import type { ConfigContext, ExpoConfig } from 'expo/config';

import { colors } from './src/ui/theme.ts';

// Keep app.json (including local EAS settings) as the base configuration.
export default ({ config }: ConfigContext): ExpoConfig => {
  const { name, slug } = config;
  if (!name || !slug) throw new Error('app.json must define the app name and slug.');
  return { ...config, name, slug, backgroundColor: colors.bg };
};
