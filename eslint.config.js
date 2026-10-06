import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'test-results/**', 'bench/results/**'] },
  js.configs.recommended,
  {
    files: ['**/*.mjs', 'demo/**/*.js'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        document: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        window: 'readonly',
      },
    },
  },
  {
    files: ['demo/**/*.js'],
    languageOptions: { globals: { Cesium: 'readonly' } },
  },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { project: ['./tsconfig.json'], tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    // The public surface states its types rather than leaving them to inference.
    files: ['src/**/*.ts'],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'error' },
  },
  {
    // Playwright sends these functions to the browser on their own, so a runtime import would be
    // missing there. Types are erased and stay allowed.
    files: ['src/**/page.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*'],
              allowTypeImports: true,
              message: 'page.ts functions run in the browser: import types only.',
            },
          ],
        },
      ],
    },
  },
);
