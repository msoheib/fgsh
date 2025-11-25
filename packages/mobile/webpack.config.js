const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const path = require('path');
const webpack = require('webpack');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);

  // DISABLE webpack filesystem cache to avoid CRC errors
  config.cache = false;

  // Webpack 5 polyfills for Node.js modules
  config.resolve.fallback = {
    ...(config.resolve.fallback || {}),
    crypto: require.resolve('crypto-browserify'),
    stream: require.resolve('stream-browserify'),
    buffer: require.resolve('buffer/'),
    vm: require.resolve('vm-browserify'),
  };

  // Add the workspace root node_modules to resolve modules
  config.resolve.modules = [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, '../../node_modules'),
    ...(config.resolve.modules || []),
  ];

  // Provide global Buffer for polyfills
  config.plugins.push(
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    })
  );

  // Customize the babel-loader to include specific node_modules that need transpilation
  config.module.rules.forEach((rule) => {
    if (rule.oneOf) {
      rule.oneOf.forEach((oneOf) => {
        if (oneOf.use && oneOf.use.loader && oneOf.use.loader.includes('babel-loader')) {
          // Default include is usually just the src directory
          // We need to expand it to include shared packages and specific node_modules
          const originalInclude = oneOf.include || [];

          oneOf.include = [
            ...(Array.isArray(originalInclude) ? originalInclude : [originalInclude]),
            path.resolve(__dirname, 'src'),
            path.resolve(__dirname, 'App.tsx'),
            path.resolve(__dirname, 'index.js'),
            path.resolve(__dirname, '../shared'), // Transpile shared package
            // Transpile problematic node_modules
            path.resolve(__dirname, 'node_modules/react-native-toast-message'),
            path.resolve(__dirname, '../../node_modules/react-native-toast-message'),
            path.resolve(__dirname, 'node_modules/@fakash'),
            path.resolve(__dirname, '../../node_modules/@fakash'),
            path.resolve(__dirname, 'node_modules/@react-native'),
            path.resolve(__dirname, '../../node_modules/@react-native'),
            path.resolve(__dirname, 'node_modules/@supabase'),
            path.resolve(__dirname, '../../node_modules/@supabase'),
          ];
        }
      });
    }
  });

  return config;
};
