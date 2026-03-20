module.exports = {
  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/tests/unit/**/*.test.js'],
      transform: {
        '^.+\\.js$': ['babel-jest', { presets: ['@babel/preset-env'] }]
      },
      setupFilesAfterEnv: ['<rootDir>/src/tests/unit/setup.js']
    },
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/public/tests/unit/**/*.test.js'],
      transform: {
        '^.+\\.js$': ['babel-jest', { presets: ['@babel/preset-env'] }]
      },
      setupFilesAfterEnv: ['<rootDir>/public/tests/setup-jsdom.js'],
      globals: {
        'jsdom': true
      }
    }
  ]
};
