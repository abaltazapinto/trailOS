import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import GarminCard from '../../integrations/garmin/GarminCard';
import { colors, spacing } from '../../ui/theme';

/**
 * Garmin sync and .fit import, presented as a modal. The Recorder only links here
 * while it is idle and not saving, so the card is never disabled.
 */
export default function GarminScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <GarminCard disabled={false} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg },
});
