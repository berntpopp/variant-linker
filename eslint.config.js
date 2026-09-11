'use strict';

const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      'dist/**',
      'coverage/**',
      'coverage-*/**',
      '.nyc_output/**',
      'temp/**',
      'docs/.vitepress/dist/**',
      'docs/.vitepress/cache/**',
      'local_data/**',
      'test/fixtures/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-constant-binary-expression': 'error',
      'no-promise-executor-return': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  { files: ['**/*.mjs'], languageOptions: { sourceType: 'module' } },
  { files: ['docs/**/*.js'], languageOptions: { sourceType: 'module' } },
  { files: ['test/**/*.{js,cjs}'], languageOptions: { globals: globals.mocha } },
  prettier,
];
