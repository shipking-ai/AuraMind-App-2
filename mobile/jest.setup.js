// Reanimated 4 runs on worklets; Jest uses their JS mocks.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
require('react-native-reanimated').setUpTests();
