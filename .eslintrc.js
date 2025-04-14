module.exports = {
  env: {
    node: true,
    es6: true,
    mocha: true,
  },
  extends: ['google', 'plugin:node/recommended', 'prettier'],
  plugins: ['prettier', 'node'],
  parserOptions: {
    ecmaVersion: 2020,
  },
  rules: {
    // Enforce Google style but with some exceptions for KISS principles
    'prettier/prettier': 'error',
    'max-len': ['error', { code: 100, ignoreUrls: true, ignoreStrings: true }],

    // More lenient JSDoc requirements
    'require-jsdoc': [
      'warn',
      {
        require: {
          FunctionDeclaration: true,
          MethodDefinition: false,
          ClassDeclaration: true,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
        },
      },
    ],
    'valid-jsdoc': [
      'warn',
      {
        requireReturn: false,
        requireReturnType: false,
        requireParamType: false,
        requireParamDescription: true,
      },
    ],

    // Loosen up some rules that would be too strict for this project
    camelcase: 'warn',
    'no-console': 'off',

    // Handle test dependencies
    'node/no-unpublished-require': [
      'error',
      {
        allowModules: ['chai', 'sinon', 'nock', 'proxyquire', 'mocha'],
      },
    ],
  },
  overrides: [
    {
      files: ['test/**/*.js'],
      rules: {
        'no-unused-expressions': 'off', // For chai assertions
        'require-jsdoc': 'off',
        'valid-jsdoc': 'off',
      },
    },
  ],
};
