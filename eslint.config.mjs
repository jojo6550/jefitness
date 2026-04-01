import js from '@eslint/js';
import globals from 'globals';
import n from 'eslint-plugin-n';
import prettier from 'eslint-plugin-prettier';
import importPlugin from 'eslint-plugin-import';
import promisePlugin from 'eslint-plugin-promise';

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

      // Promises
      'promise/prefer-await-to-then': 'error',
      'promise/no-nesting': 'warn',

      // Imports
      'import/no-unresolved': 'error',
      'import/order': ['warn', { 'newlines-between': 'always' }],

      // Node specific (migrated from eslint-plugin-node)
      'n/no-unsupported-features/es-syntax': 'error',
      'n/no-unpublished-require': 'warn',
      'n/no-missing-require': 'error',
      'n/no-extraneous-require': 'warn',

      // Express specific (manual)
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

