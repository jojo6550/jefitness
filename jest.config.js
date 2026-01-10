module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['./tests/setup.js'],
  testTimeout: 60000,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/seedPrograms.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  transformIgnorePatterns: [
    "node_modules/(?!(jsdom|@exodus/bytes|mongoose|mongodb|bson)/)"
  ],
  transform: {
    '^.+\\.mjs$': 'babel-jest',
    '^.+\\.js$': 'babel-jest'
  }
};
