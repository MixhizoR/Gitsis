// ============================================================================
//  eslint.config.js — Flat config (ESLint 9).
//  Odak: kullanilmayan import/degisken yakalama + React Hooks guvencesi.
// ============================================================================
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Klasik Hook guvencesi. (v6+ deneysel mimari kurallari — refs,
      // set-state-in-effect vb. — mevcut kod tabaninda buyuk refactor
      // gerektirdiginden acik bir sekilde KAPALI tutulur.)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Kabul kriteri: kullanilmayan import/degiskenler HATA sayilir.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
]
