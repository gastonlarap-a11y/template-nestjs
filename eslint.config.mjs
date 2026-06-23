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
  // Clean Architecture guardrail: enforce the inward-only dependency direction
  // within feature slices. Scoped to `src/modules/**` so shared `libs/` and test
  // files are exempt. Layers are folder-mode elements (so intra-layer imports —
  // e.g. a port importing its entity, a use-case importing its DTO — are the same
  // element and need no rule); controllers/modules are the two root-level files.
  {
    files: ['src/modules/**/*.ts'],
    ignores: ['src/modules/**/*.spec.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        {
          type: 'domain',
          pattern: 'src/modules/*/domain',
          mode: 'folder',
          capture: ['feature'],
        },
        {
          type: 'application',
          pattern: 'src/modules/*/application',
          mode: 'folder',
          capture: ['feature'],
        },
        {
          type: 'infrastructure',
          pattern: 'src/modules/*/infrastructure',
          mode: 'folder',
          capture: ['feature'],
        },
        {
          type: 'presentation',
          pattern: 'src/modules/*/*.controller.ts',
          mode: 'file',
          capture: ['feature'],
        },
        {
          type: 'module',
          pattern: 'src/modules/*/*.module.ts',
          mode: 'file',
          capture: ['feature'],
        },
      ],
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
      },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          rules: [
            // domain is the innermost layer — depends on no other layer.
            { from: { type: 'domain' }, disallow: { to: { type: '*' } } },
            {
              from: { type: 'application' },
              allow: { to: { type: 'domain' } },
            },
            {
              from: { type: 'infrastructure' },
              allow: { to: { type: ['domain', 'application'] } },
            },
            {
              from: { type: 'presentation' },
              allow: { to: { type: ['domain', 'application'] } },
            },
            // the module is the composition root — it wires every layer of its
            // feature together, including its own controller (presentation).
            {
              from: { type: 'module' },
              allow: {
                to: {
                  type: ['domain', 'application', 'infrastructure', 'presentation'],
                },
              },
            },
          ],
        },
      ],
    },
  },
);
