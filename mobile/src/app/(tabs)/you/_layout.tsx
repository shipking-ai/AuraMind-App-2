import { Stack } from 'expo-router';
import { largeTitleOptions } from '../../../navigation/largeTitleStack';

export default function YouStack() {
  return <Stack screenOptions={largeTitleOptions}><Stack.Screen name="index" options={{ title: 'You' }} /></Stack>;
}
