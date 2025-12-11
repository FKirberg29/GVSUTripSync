/**
 * TripSync Web App - Jest Test Setup
 * 
 * Configures the testing environment with:
 * - Jest DOM matchers for easier DOM assertions
 * - Firebase service mocks
 * - Google Maps API mocks
 * - Console error suppression for cleaner test output
 */

import '@testing-library/jest-dom';

jest.mock('./firebaseConfig', () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: jest.fn(),
  },
  db: {},
  storage: {},
  functions: {},
  signInWithGoogle: jest.fn(),
  signOutUser: jest.fn(),
}));

global.google = {
  maps: {
    places: {
      Place: jest.fn(),
    },
  },
};

global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
};
