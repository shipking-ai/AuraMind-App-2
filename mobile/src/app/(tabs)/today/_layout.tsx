import { Stack } from 'expo-router';
import { largeTitleOptions } from '../../../navigation/largeTitleStack';

export default function TodayStack() {
  return <Stack screenOptions={largeTitleOptions}><Stack.Screen name="index" options={{ title: 'Today' }} /></Stack>;
}
