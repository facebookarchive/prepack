/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

const path = require('path');
const webpack = require('webpack');

const WebpackConfig = {
    entry: "./lib/serializer/index.js",
    output: {
        path: path.join(__dirname),
        filename: "prepack.min.js",
        library: 'prepack',
    },

    plugins: [
      new webpack.optimize.UglifyJsPlugin({
        sourceMap: false,
      })
    ],
};

module.exports = WebpackConfig;
