module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: [
    '.eslintrc.js',
    'babel.config.js',
    'metro.config.js',
    'jest.config.js',
    'tailwind.config.js',
    'index.js',
  ],
  rules: {
    'react-native/no-inline-styles': 'off',
  },
};
