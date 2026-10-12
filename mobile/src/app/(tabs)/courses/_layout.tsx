import { Stack } from 'expo-router';
import { largeTitleOptions } from '../../../navigation/largeTitleStack';

export default function CoursesStack() {
  return <Stack screenOptions={largeTitleOptions}><Stack.Screen name="index" options={{ title: 'Courses' }} /><Stack.Screen name="[id]" options={{ headerLargeTitle: false }} /></Stack>;
}
