// One ESLint config for the whole monorepo. Each package runs `eslint <dirs>`
// and ESLint walks up to this file. Prettier owns formatting, so stylistic
// rules are switched off at the end.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import expoConfig from 'eslint-config-expo/flat.js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const nodePackages = ['apps/api/**/*.ts', 'packages/shared/**/*.ts'];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.expo/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
      'apps/mobile/expo-env.d.ts',
    ],
  },

  // API + shared: plain TypeScript on Node.
  {
    files: nodePackages,
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/api/**/*.spec.ts', 'apps/api/test/**/*.ts'],
    languageOptions: { globals: globals.vitest },
  },

  // Admin web app: the same React config as the app, for the browser.
  ...expoConfig.map((config) => ({ ...config, files: ['apps/admin/**/*.{ts,tsx}'] })),
  {
    files: ['apps/admin/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.vitest } },
    settings: { 'import/resolver': { typescript: { project: 'apps/admin/tsconfig.json' } } },
  },

  // Mobile: Expo's recommended config (React, hooks, import resolution).
  ...expoConfig.map((config) => ({ ...config, files: ['apps/mobile/**/*.{ts,tsx,js}'] })),
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    settings: { 'import/resolver': { typescript: { project: 'apps/mobile/tsconfig.json' } } },
  },
  // Screens use theme tokens (src/theme/tokens.ts), never colour literals.
  {
    files: ['apps/mobile/src/app/**/*.{ts,tsx}', 'apps/mobile/src/features/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message: 'No hex colours in screens: use a token from useTheme() (t.color.*).',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]',
          message: 'No hex colours in screens: use a token from useTheme() (t.color.*).',
        },
      ],
    },
  },
  // Hex literals that exist today, each owned by the screen slice that restyles it.
  // Remove the entry (and use a token) in that slice.
  {
    files: [
      'apps/mobile/src/features/status/FirebaseBanner.tsx', // TODO #141 (loading and error states)
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['apps/mobile/**/*.test.{ts,tsx}', 'apps/mobile/jest.setup.ts'],
    languageOptions: { globals: globals.jest },
  },

  prettier,
);
