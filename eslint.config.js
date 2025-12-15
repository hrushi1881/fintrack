// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    rules: {
      // For launch readiness: avoid large-scale behavior changes from auto-adding deps
      'react-hooks/exhaustive-deps': 'off',
      // Temporarily suppress unused vars warnings across the codebase
      '@typescript-eslint/no-unused-vars': 'off',
      // Allow require() in TypeScript where necessary
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
