/**
 * @fileoverview Webpack configuration for building the Variant-Linker library.
 */

'use strict';

const path = require('path');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'variant-linker.bundle.js',
    path: path.resolve(__dirname, 'dist'),
    // Export as a UMD library so that it can be used in different module systems.
    library: 'VariantLinker',
    libraryTarget: 'umd',
    globalObject: 'this',
    // Export the default export from index.js.
    libraryExport: 'default'
  },
  resolve: {
    fallback: {
      // For browser builds, redirect Node's "fs" module to an empty module.
      fs: require.resolve('./src/empty.js'),
      // Use a browser-compatible version of "path".
      path: require.resolve('path-browserify'),
      // Disable crypto for browser builds (cache will use memory-only mode)
      crypto: false,
      // Disable os module for browser builds
      os: false
    }
  },
  module: {
    rules: [
      {
        // Transpile ES6+ code with Babel.
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: { presets: ['@babel/preset-env'] }
        }
      },
      {
        // Enable importing JSON files.
        test: /\.json$/,
        type: 'javascript/auto',
        use: ['json-loader']
      }
    ]
  },
  mode: 'development'
};
