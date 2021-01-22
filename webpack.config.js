/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

const path = require("path");
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');

process.env.NODE_ENV = "production";

const WebpackConfig = {
  entry: "./",
  output: {
    path: path.join(__dirname),
    filename: "prepack.min.js",
    library: "Prepack",
  },
  parallelism: 1,
  profile: true,
  mode: process.env.NODE_ENV == "production" ? process.env.NODE_ENV || "development",
  optimization: {
    minimize: [new UglifyJsPlugin()],
    splitChunks: {
		cacheGroups: {
			vendors: {
				priority: -10,
				test: /[\\/]node_modules[\\/]/
			}
		},
		chunks: 'async',
		minChunks: 1,
		minSize: 30000,
		name: true
		}
 },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: {
          loader: "babel-loader",
        },
      },
    ],
  },
};

module.exports = WebpackConfig;
