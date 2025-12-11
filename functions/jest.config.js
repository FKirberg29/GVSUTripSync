module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.js',
    '**/*.test.js',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!nanoid)',
  ],
  collectCoverageFrom: [
    'index.js',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Mock nanoid to avoid ES module issues
  moduleNameMapper: {
    '^nanoid$': '<rootDir>/__mocks__/nanoid.js',
  },
};

