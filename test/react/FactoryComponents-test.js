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

it("Simple factory classes", () => {
  runTest(__dirname + "/FactoryComponents/simple.js");
});

it("Simple factory classes 2", () => {
  runTest(__dirname + "/FactoryComponents/simple2.js");
});
