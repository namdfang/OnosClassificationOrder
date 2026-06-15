const { RunScriptWebpackPlugin } = require('run-script-webpack-plugin');
const path = require('path');
const nodeExternals = require('webpack-node-externals');

console.log(nodeExternals());

/** @type {import('@rspack/cli').Configuration} */
const config = {
  experiments: {
    rspackFuture: {
      disableTransformByDefault: true,
    },
  },
  context: __dirname,
  target: 'node',
  entry: {
    main: ['./src/main.ts'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              parser: {
                syntax: 'typescript',
                decorators: true,
              },
              transform: {
                legacyDecorator: true,
                decoratorMetadata: true,
              },
            },
          },
        },
      },
    ],
  },
  optimization: {
    minimize: false,
  },
  resolve: {
    // tsConfigPath: path.resolve(__dirname, 'tsconfig.json'),
    alias: {
      '@': path.resolve(__dirname, './src'),
      // core: path.resolve(__dirname, '../../packages/core'),
      // shared: path.resolve(__dirname, '../../packages/core'),
      // '@core': path.resolve(__dirname, '../../packages/core'),
      // '@shared': path.resolve(__dirname, '../../packages/shared'),
    },
  },
  externalsType: 'commonjs',
  plugins: [
    !process.env.BUILD &&
      new RunScriptWebpackPlugin({
        name: 'main.js',
        autoRestart: true,
      }),
  ],
  devServer: {
    devMiddleware: {
      writeToDisk: true,
    },
  },
  externalsPresets: { node: true },
  externals: [
    nodeExternals({
      // allowlist: ['core', 'shared'],
    }),
  ],
};
module.exports = config;
