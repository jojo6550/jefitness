module.exports = {
  testTimeout: 60000,
  coverageReporters: ['text', 'lcov', 'html'],
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['./tests/setup.js'],
      testPathIgnorePatterns: ['tests/websocket.test.js'],
      collectCoverageFrom: [
        'src/**/*.js',
        '!src/server.js',
        '!src/seedPrograms.js'
      ],
      coverageDirectory: 'coverage',
      transformIgnorePatterns: [
        "node_modules/(?!(jsdom|@exodus/bytes|mongoose|mongodb|bson)/)"
      ],
      transform: {
        '^.+\\.mjs$': 'babel-jest',
        '^.+\\.js$': 'babel-jest'
      }
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['./tests/setup-jsdom.js'],
      testMatch: ['**/tests/websocket.test.js'],
      transformIgnorePatterns: [
        "node_modules/(?!(jsdom|@exodus/bytes|mongoose|mongodb|bson)/)"
      ],
      transform: {
        '^.+\\.mjs$': 'babel-jest',
        '^.+\\.js$': 'babel-jest'
      }
    }
  ]
};
