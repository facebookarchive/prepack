/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

module.exports = function(api) {
  api.cache(true);

  const plugins = [
    "@babel/plugin-syntax-flow",
    "@babel/plugin-syntax-jsx",
    "@babel/plugin-transform-flow-strip-types",
    "@babel/plugin-transform-react-jsx",
    "@babel/plugin-transform-react-display-name",
    "@babel/plugin-proposal-class-properties",
    "@babel/plugin-proposal-object-rest-spread",
  ];

  // Webpack bundle
  if (process.env.NODE_ENV === "production") {
    return {
      presets: [
        [
          "@babel/env",
          {
            targets: {
              ie: "10",
            },
            forceAllTransforms: true,
          },
        ],
        "@babel/preset-flow",
      ],
      plugins,
    };
  }
  // Default
  return {
    presets: [
      [
        "@babel/env",
        {
          targets: {
            node: "6.10",
          },
        },
      ],
      "@babel/preset-flow",
    ],
    plugins,
    // `lib` files are already compiled with Babel. Don't try to compile them again.
    ignore: ["lib/**/*.js"],
  };
};
