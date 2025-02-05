// webpack.config.js
const path = require('path');

module.exports = {
  // Set the entry point to the library’s index file.
  entry: './src/index.js',
  output: {
    filename: 'variant-linker.bundle.js',
    path: path.resolve(__dirname, 'dist'),
    // Export as a UMD library so it can be loaded in different module systems.
    library: 'VariantLinker',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  // Tell webpack what to do with Node built-in modules.
  resolve: {
    fallback: {
      // Disable file system functions because they are not available in the browser.
      fs: false,
      // If you need to use "path" in the browser, use a browser-compatible version.
      path: require.resolve('path-browserify'),
      // Other Node modules can be added here if needed.
      // e.g. os: false, crypto: require.resolve('crypto-browserify')
    }
  },
  module: {
    rules: [
      {
        // Transpile our source code with Babel.
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      },
      {
        // JSON files can be loaded natively in webpack 5 (or you may use json-loader if needed).
        test: /\.json$/,
        type: 'javascript/auto',
        use: [ 'json-loader' ]
      }
    ]
  },
  // Set mode to 'development' (or 'production' when building for release)
  mode: 'development'
};
