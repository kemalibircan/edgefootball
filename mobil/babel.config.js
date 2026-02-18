module.exports = function babelConfig(api) {
  const isTest = api.env('test');
  api.cache.using(() => process.env.BABEL_ENV || process.env.NODE_ENV || 'development');

  const presets = ['module:@react-native/babel-preset', 'nativewind/babel'];
  const plugins = [];

  if (!isTest) {
    plugins.push([
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        path: '.env.development',
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
