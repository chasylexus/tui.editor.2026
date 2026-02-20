/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const webpack = require('webpack');
const { name, version, author, license } = require('./package.json');

const TerserPlugin = require('terser-webpack-plugin');
const ESLintPlugin = require('eslint-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

const baseFilename = `td-${name.replace(/@techie_doubts\//, '')}`;

function getOutputConfig(isProduction, isCDN, minify) {
  const defaultConfig = {
    library: {
      name: ['toastui', 'Editor', 'plugin', 'export'],
      export: 'default',
      type: 'umd',
    },
    environment: {
      arrowFunction: false,
      const: false,
    },
  };

  if (!isProduction || isCDN) {
    const config = {
      ...defaultConfig,
      path: path.resolve(__dirname, 'dist/cdn'),
      filename: `${baseFilename}${minify ? '.min' : ''}.js`,
    };

    if (!isProduction) {
      config.publicPath = '/dist/cdn';
    }

    return config;
  }

  return {
    ...defaultConfig,
    path: path.resolve(__dirname, 'dist'),
    filename: `${baseFilename}.js`,
  };
}

function getOptimizationConfig(isProduction, minify) {
  const minimizer = [];

  if (isProduction && minify) {
    minimizer.push(
      new TerserPlugin({
        parallel: true,
        extractComments: false,
      })
    );
    minimizer.push(new CssMinimizerPlugin());
  }

  return { minimizer };
}

module.exports = (env) => {
  const isProduction = env.WEBPACK_BUILD;
  const { minify = false, cdn = false } = env;
  const config = {
    mode: isProduction ? 'production' : 'development',
    entry: './src/index.ts',
    output: getOutputConfig(isProduction, cdn, minify),
    module: {
      rules: [
        {
          test: /\.ts$|\.js$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
              },
            },
          ],
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    optimization: getOptimizationConfig(isProduction, minify),
  };

  config.plugins = [
    new MiniCssExtractPlugin({
      filename: () => `${baseFilename}${minify ? '.min' : ''}.css`,
    }),
    new ESLintPlugin({
      extensions: ['js', 'ts'],
      exclude: ['node_modules', 'dist'],
      failOnError: isProduction,
    }),
  ];

  if (isProduction) {
    config.plugins.push(
      new webpack.BannerPlugin(
        [
          'TOAST UI Editor : Export Plugin',
          `@version ${version} | ${new Date().toDateString()}`,
          `@author ${author}`,
          `@license ${license}`,
        ].join('\n')
      )
    );
  } else {
    config.devServer = {
      // https://github.com/webpack/webpack-dev-server/issues/2484
      injectClient: false,
      inline: true,
      host: '0.0.0.0',
      port: 8081,
    };
    config.devtool = 'inline-source-map';
  }

  return config;
};
