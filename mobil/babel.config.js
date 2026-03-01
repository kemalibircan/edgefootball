module.exports = function babelConfig(api) {
  const fs = require('fs');
  const path = require('path');
  const isTest = api.env('test');
  api.cache.using(() => process.env.BABEL_ENV || process.env.NODE_ENV || 'development');

  const presets = ['module:@react-native/babel-preset', 'nativewind/babel'];
  const plugins = [];
  const developmentEnvPath = path.resolve(__dirname, '.env.development');
  const fallbackEnvPath = path.resolve(__dirname, '.env');
  const selectedEnvPath = fs.existsSync(developmentEnvPath) ? developmentEnvPath : fallbackEnvPath;

  if (!isTest) {
    plugins.push([
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        path: selectedEnvPath,
        allowUndefined: true,
      },
    ]);
  }

  plugins.push('react-native-reanimated/plugin');

  return {
    presets,
    plugins,
  };
};
