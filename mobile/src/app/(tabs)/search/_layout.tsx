import { Stack } from 'expo-router';
import { largeTitleOptions } from '../../../navigation/largeTitleStack';

export default function SearchStack() {
  return <Stack screenOptions={largeTitleOptions}><Stack.Screen name="index" options={{ title: 'Search' }} /></Stack>;
}
