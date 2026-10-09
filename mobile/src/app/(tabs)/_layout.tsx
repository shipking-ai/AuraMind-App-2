import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { colors } from '../../design/tokens';

/**
 * The system tab bar: Liquid Glass on iOS 26 (floats, minimizes on scroll,
 * search in its own button), Material bottom navigation on Android. No
 * custom background, which would block the glass.
 */
export default function TabsLayout() {
  return (
    <NativeTabs minimizeBehavior="onScrollDown" tintColor={colors.violetMist}>
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Icon sf="sun.max" md="today" />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="courses">
        <NativeTabs.Trigger.Icon sf="books.vertical" md="library_books" />
        <NativeTabs.Trigger.Label>Courses</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="you">
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="person" />
        <NativeTabs.Trigger.Label>You</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search" role="search">
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
