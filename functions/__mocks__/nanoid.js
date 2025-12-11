// Mock for nanoid to avoid ES module issues in tests
module.exports = {
  nanoid: jest.fn(() => 'mock-nanoid-' + Math.random().toString(36).substr(2, 9)),
};

// Also export as default for compatibility
module.exports.default = module.exports.nanoid;

