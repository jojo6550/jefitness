import js from '@eslint/js';
import globals from 'globals';
import n from 'eslint-plugin-n';
import prettier from 'eslint-plugin-prettier';
import importPlugin from 'eslint-plugin-import';
import promisePlugin from 'eslint-plugin-promise';
import nodePlugin from 'eslint-plugin-node';

export default [
  js.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    plugins: {
      n: n,
      prettier,
      import: importPlugin,
      promise: promisePlugin,
      node: nodePlugin,
    },
    rules: {
      // Prettier integration
      'prettier/prettier': 'error',

      // Common JS errors
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'require-await': 'error',
      'no-return-await': 'error',
      'consistent-return': 'error',

      // Quotes, formatting
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always'],
      'comma-dangle': ['error', 'es5'],
      indent: ['error', 2],
      'no-trailing-spaces': 'error',
      'eol-last': 'error',

      // Promises
      'promise/prefer-await-to-then': 'error',
      'promise/no-nesting': 'warn',

      // Imports
      'import/no-unresolved': 'error',
      'import/order': ['warn', { 'newlines-between': 'always' }],

      // Node specific
      'n/no-unsupported-features/es-syntax': 'error',
      'n/no-unpublished-require': 'warn',
      'node/no-missing-require': 'error',
      'node/no-extraneous-require': 'warn',

      // Express specific (manual)
      'no-floating-promises': 'error',
    },
    settings: {
      'import/core-modules': ['express', 'mongoose'],
    },
  },
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'reports/**',
      'dist/**',
      'build/**',
      '*.log',
      '.env*',
    ],
  },
  {
    files: ['src/**/*.js', 'scripts/**/*.js'],
  }
];

