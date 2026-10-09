module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // @bonamind/core is linked from ../packages/core; Babel-injected helpers
  // (@babel/runtime) in its files must resolve from this app's node_modules.
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/'],
};
