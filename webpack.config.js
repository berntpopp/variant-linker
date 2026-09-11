'use strict';
const path = require('path');
module.exports = {
  entry: './src/index.js',
  target: ['web', 'es2022'],
  output: {
    filename: 'variant-linker.bundle.js',
    path: path.resolve(__dirname, 'dist'),
    library: { name: 'VariantLinker', type: 'umd', export: 'default' },
    globalObject: 'globalThis',
  },
  resolve: {
    fallback: {
      fs: false,
      path: require.resolve('path-browserify'),
      crypto: false,
      os: false,
      readline: false,
    },
  },
  performance: { hints: false },
  mode: 'production',
};
