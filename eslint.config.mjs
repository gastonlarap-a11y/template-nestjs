// @ts-check
import eslint from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // Async methods that implement an async port with a synchronous body
      // (e.g. the in-memory repository / test fakes) are intentional.
      '@typescript-eslint/require-await': 'off',
      // Allow underscore-prefixed unused args/vars (interface-mandated params).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  // VSA guardrail: enforce CLAUDE.md rule 1 — dependency flow is `src -> libs`,
  // never `libs -> src`. `default: 'allow'` keeps every other import path
  // (feature -> feature, feature -> lib, lib -> lib) untouched; this rule only
  // exists to fail the build if a shared `libs/*` module ever reaches back
  // into `src/features/*` or `src/*` root files.
  {
    files: ['libs/**/*.ts', 'src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'lib', pattern: 'libs/*', mode: 'folder', capture: ['lib'] },
        {
          type: 'feature',
          pattern: 'src/features/*',
          mode: 'folder',
          capture: ['feature'],
        },
        { type: 'app-root', pattern: 'src/*.ts', mode: 'file' },
      ],
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
      },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: { type: 'lib' },
              disallow: { to: { type: ['feature', 'app-root'] } },
            },
          ],
        },
      ],
    },
  },
);
