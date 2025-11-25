module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // NativeWind removed - components use StyleSheet.create instead
    plugins: [],
  };
};
