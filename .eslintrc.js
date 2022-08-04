module.exports = {
  'env': {
    'browser': true,
    'es2021': true,
    'node': true,
  },
  'extends': [
    'eslint:recommended',
    'plugin:vue/vue3-essential',
    'plugin:@typescript-eslint/recommended',
    'prettier'
  ],
  'parser': 'vue-eslint-parser',
  'parserOptions': {
    'parser': '@typescript-eslint/parser',
    'sourceType': 'module',
  },
  'plugins': ['vue', '@typescript-eslint'],
  'rules': {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error',
      { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }
    ],
    'no-constant-condition': ['error', { 'checkLoops': false }]
  }
};