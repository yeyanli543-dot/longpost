const tseslint = require('typescript-eslint');

let reactHooks;
try {
  reactHooks = require('eslint-plugin-react-hooks');
} catch (e) {
  reactHooks = {
    rules: {
      'exhaustive-deps': { create: () => ({}) },
      'rules-of-hooks': { create: () => ({}) },
    },
  };
}

module.exports = tseslint.config(
  {
    ignores: [
      'dist/**',
      'archive/**',
      'dist-server/**',
      'node_modules/**',
      'source_package/**',
      'desktop/**',
      'mobile/**',
      'scripts/**',
      '**/vendor/**',
      'client/public/**',
      'client/src/api/gen/**',
      '**/*.d.ts',
      '**/*.js.map',
      '*.config.js',
      '*.config.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['client/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['client/src/**/*.{ts,tsx}', 'server/**/*.{ts,tsx}', 'shared/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'prefer-const': 'warn',
    },
  },
);
