/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

// The irony :P
/* eslint-disable no-undef */
module.exports = {
  env: {
    commonjs: true,
    browser: true,
  },
  rules: {
    "no-undef": "error",
    "no-use-before-define": ["error", { variables: false, functions: false }],
  },
  parserOptions: {
    ecmaVersion: 2018,
    ecmaFeatures: {
      jsx: true,
    },
  },
  globals: {
    // FB
    Env: true,
    Bootloader: true,
    JSResource: true,
    babelHelpers: true,
    regeneratorRuntime: true,
    asset: true,
    cx: true,
    cssVar: true,
    csx: true,
    errorDesc: true,
    errorHelpCenterID: true,
    errorSummary: true,
    gkx: true,
    glyph: true,
    ifRequired: true,
    ix: true,
    fbglyph: true,
    fbt: true,
    requireWeak: true,
    xuiglyph: true,
    DebuggerInternal: true,
    define: true,
    // React
    React: true,
    __REACT_DEVTOOLS_GLOBAL_HOOK__: true,
    // Normal
    Exception: true,
    Error: true,
    setImmediate: true,
    clearImmediate: true,
    DataView: true,
    ArrayBuffer: true,
    Uint8Array: true,
    Float32Array: true,
    Int32Array: true,
    // ES 6
    Promise: true,
    Map: true,
    Set: true,
    Proxy: true,
    Symbol: true,
    WeakMap: true,
    WeakSet: true,
    Reflect: true,
    // Vendor specific
    MSApp: true,
    ActiveXObject: true,
    // CommonJS / Node
    process: true,
    // Prepack
    __optimize: true,
    __optimizeReactComponentTree: true,
    __abstract: true,
    __makeFinal: true,
  },
};
