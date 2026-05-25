// Babel config for Expo SDK 56 / Reanimated 4.
// - `babel-preset-expo` is required.
// - `@babel/plugin-transform-async-generator-functions` is required so that
//   `for await ... of` over PowerSync watched queries compiles on all engines.
// - `react-native-worklets/plugin` REPLACES the old `react-native-reanimated/plugin`
//   in Reanimated 4 / RN 0.85 / Expo SDK 56 and must be last.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      '@babel/plugin-transform-async-generator-functions',
      'react-native-worklets/plugin'
    ]
  };
};
