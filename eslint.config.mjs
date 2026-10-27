// One ESLint config for the whole monorepo. Each package runs `eslint <dirs>`
// and ESLint walks up to this file. Prettier owns formatting, so stylistic
// rules are switched off at the end.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import expoConfig from 'eslint-config-expo/flat.js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Props that carry text a user reads or a screen reader says. A string literal in
// one of them must come from `t()` instead (see src/i18n).
const TEXT_PROPS =
  '/^(title|label|placeholder|accessibilityLabel|accessibilityHint|headerTitle|subtitle|text|message|description|alt)$/';
const hardCodedTextSelectors = [
  'JSXElement > JSXExpressionContainer > Literal[value=/[A-Za-z]/]',
  `JSXAttribute[name.name=${TEXT_PROPS}] > Literal`,
  `JSXAttribute[name.name=${TEXT_PROPS}] > JSXExpressionContainer > :matches(Literal, TemplateLiteral)`,
  `JSXAttribute[name.name=${TEXT_PROPS}] > JSXExpressionContainer > :matches(ConditionalExpression, LogicalExpression) > Literal[value=/[A-Za-z]/]`,
].map((selector) => ({
  selector,
  message: 'No hard-coded text in screens: add it to src/i18n/locales/en and use t().',
}));

const hexSelectors = [
  'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
  'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]',
].map((selector) => ({
  selector,
  message: 'No hex colours in screens: use a token from useTheme() (t.color.*).',
}));

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

  // Admin screens: text comes from the message files (src/i18n/locales), in French and English.
  // Only symbols may stay in JSX.
  {
    files: ['apps/admin/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', 'apps/admin/src/test/**'],
    rules: {
      'no-restricted-syntax': ['error', ...hardCodedTextSelectors],
      'react/jsx-no-literals': ['error', { allowedStrings: ['·', '›', '‹', '-'] }],
    },
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
      'no-restricted-syntax': ['error', ...hexSelectors, ...hardCodedTextSelectors],
      // Text on screen comes from the message files (src/i18n/locales). Only symbols
      // such as "·" and "›" may stay in JSX.
      'react/jsx-no-literals': ['error', { allowedStrings: ['·', '›', '‹', '≡', '🚚'] }],
    },
  },
  // Developer-only kits (behind __DEV__): never shown to users, so not translated.
  {
    files: ['apps/mobile/src/app/dev/**', 'apps/mobile/src/features/dev/**'],
    rules: {
      'react/jsx-no-literals': 'off',
      'no-restricted-syntax': ['error', ...hexSelectors],
    },
  },
  // Hex literals that exist today, each owned by the screen slice that restyles it.
  // Remove the entry (and use a token) in that slice.
  {
    files: [
      'apps/mobile/src/features/status/FirebaseBanner.tsx', // TODO #141 (loading and error states)
    ],
    rules: { 'no-restricted-syntax': ['error', ...hardCodedTextSelectors] },
  },
  {
    files: ['apps/mobile/**/*.test.{ts,tsx}', 'apps/mobile/jest.setup.ts'],
    languageOptions: { globals: globals.jest },
  },

  prettier,
);
