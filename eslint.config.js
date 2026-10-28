// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import angular from 'angular-eslint';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['**/dist/', '**/.angular/', '**/coverage/', '.pnpm-store/', 'data/', 'reference/', 'docs/'],
  },

  // TypeScript everywhere, with type information.
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // Node packages.
  {
    files: ['packages/app/**/*.ts', 'packages/styles/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // Angular UI.
  {
    files: ['packages/web/**/*.ts'],
    extends: [angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    languageOptions: { globals: globals.browser },
    rules: {
      // Components are elements (mr-shell); surface components may be attributes (mr-glass-panel).
      '@angular-eslint/component-selector': [
        'error',
        [
          { type: 'element', prefix: 'mr', style: 'kebab-case' },
          { type: 'attribute', prefix: 'mr', style: 'kebab-case' },
        ],
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'mr', style: 'camelCase' },
      ],
    },
  },
  {
    files: ['packages/web/**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },

  // Layer boundaries inside packages/app (ADR-0010):
  //   domain   → nothing
  //   app      → domain
  //   adapter  → domain, app; never another adapter
  {
    files: ['packages/app/src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'domain', pattern: 'packages/app/src/domain' },
        { type: 'app', pattern: 'packages/app/src/app' },
        { type: 'adapter', pattern: 'packages/app/src/adapters/*', capture: ['name'] },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            { from: { element: { type: 'app' } }, allow: { to: { element: { type: 'domain' } } } },
            {
              from: { element: { type: 'adapter' } },
              allow: { to: { element: { types: { anyOf: ['domain', 'app'] } } } },
            },
          ],
        },
      ],
    },
  },
);
