// ============================================================================
//  eslint.config.js — Flat config (ESLint 9), Node/Express backend.
//  Odak: kullanilmayan import/degisken yakalama.
// ============================================================================
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // Kabul kriteri: kullanilmayan import/degiskenler HATA sayilir.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
