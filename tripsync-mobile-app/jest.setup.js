// Manual Jest setup for React Native/Expo (avoiding jest-expo bug)

// Define React Native globals
global.__DEV__ = true;

// Firebase mocks
jest.mock('./FirebaseConfig', () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: jest.fn(() => jest.fn()),
  },
  db: {},
  storage: {},
}));

// Expo module mocks
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(() => Promise.resolve({ coords: { latitude: 0, longitude: 0 } })),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ cancelled: true })),
  launchCameraAsync: jest.fn(() => Promise.resolve({ cancelled: true })),
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///test/',
  uploadAsync: jest.fn(() => Promise.resolve({})),
}));

jest.mock('expo-firebase-analytics', () => ({
  logEvent: jest.fn(() => Promise.resolve()),
}));

// Suppress console in tests
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  warn: jest.fn(),
  error: jest.fn(),
};
