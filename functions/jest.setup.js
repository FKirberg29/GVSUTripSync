// Setup for Firebase Functions tests
// This file runs before each test file

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  const mockFirestore = {
    collection: jest.fn(() => mockFirestore),
    doc: jest.fn(() => mockFirestore),
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    add: jest.fn(),
    where: jest.fn(() => mockFirestore),
    limit: jest.fn(() => mockFirestore),
    runTransaction: jest.fn(),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn(),
    })),
  };

  return {
    initializeApp: jest.fn(),
    getApp: jest.fn(() => ({})),
    firestore: () => mockFirestore,
    auth: () => ({
      getUser: jest.fn(),
    }),
    FieldValue: {
      serverTimestamp: jest.fn(() => ({ _methodName: 'serverTimestamp' })),
    },
    Timestamp: {
      now: jest.fn(() => ({ seconds: Math.floor(Date.now() / 1000), nanos: 0 })),
      fromMillis: jest.fn((ms) => ({ seconds: Math.floor(ms / 1000), nanos: 0 })),
    },
  };
});

