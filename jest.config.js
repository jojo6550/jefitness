module.exports = {
  testTimeout: 60000,
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.js',
    'public/js/**/*.js',
    '!src/server.js',
    '!src/seedPrograms.js',
    '!src/tests/**',
    '!public/tests/**'
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/src/tests/setup.js'],
      testMatch: [
        '<rootDir>/src/tests/**/*.test.js'
      ],
      testPathIgnorePatterns: [
        '/node_modules/',
        '/public/'
      ],
      collectCoverageFrom: [
        'src/**/*.js',
        '!src/server.js',
        '!src/seedPrograms.js',
        '!src/tests/**'
      ],
      coverageDirectory: 'coverage/backend',
      transformIgnorePatterns: [
        "node_modules/(?!(jsdom|@exodus/bytes|mongoose|mongodb|bson)/)"
      ],
      transform: {
        '^.+\\.mjs$': 'babel-jest',
        '^.+\\.js$': 'babel-jest'
      }
    },
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/public/tests/setup-jsdom.js'],
      testMatch: [
        '<rootDir>/public/tests/**/*.test.js'
      ],
      testPathIgnorePatterns: [
        '/node_modules/',
        '/src/'
      ],
      collectCoverageFrom: [
        'public/js/**/*.js',
        '!public/js/app.js',
        '!public/tests/**'
      ],
      coverageDirectory: 'coverage/frontend',
      transformIgnorePatterns: [
        "node_modules/(?!(jsdom|@exodus/bytes)/)"
      ],
      transform: {
        '^.+\\.mjs$': 'babel-jest',
        '^.+\\.js$': 'babel-jest'
      }
    }
  ]
};