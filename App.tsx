import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import ActivityRecorderScreen from './src/screens/ActivityRecorderScreen';
import { colors } from './src/ui/theme';

void SystemUI.setBackgroundColorAsync(colors.bg);

export default function App() {
  return (
    <>
      <ActivityRecorderScreen />
      <StatusBar style="light" />
    </>
  );
}
