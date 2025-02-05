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
      // Redirect the Node "fs" module to an empty module so that browser builds do not attempt to include it.
      fs: require.resolve('./src/empty.js'),
      // Provide a browser-compatible version of "path".
      path: require.resolve('path-browserify')
      // Add other Node modules here if needed.
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
        // Load JSON files (webpack 5 can do this natively, but you can also use json-loader).
        test: /\.json$/,
        type: 'javascript/auto',
        use: [ 'json-loader' ]
      }
    ]
  },
  // Set mode to 'development' (or 'production' when building for release).
  mode: 'development'
};
