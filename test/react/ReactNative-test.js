/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

const setupReactTests = require("./setupReactTests");
const { runTest } = setupReactTests();

/* eslint-disable no-undef */
const { it } = global;

it.only("Simple", async () => {
  runTest(__dirname + "/ReactNative/simple.js");
});

it("Simple 2", async () => {
  runTest(__dirname + "/ReactNative/simple2.js");
});