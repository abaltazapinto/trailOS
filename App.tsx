import { StatusBar } from 'expo-status-bar';
import ActivityRecorderScreen from './src/screens/ActivityRecorderScreen';

export default function App() {
  return (
    <>
      <ActivityRecorderScreen />
      <StatusBar style="auto" />
    </>
  );
}
