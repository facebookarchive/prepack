/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

const fs = require("fs");
const setupReactTests = require("./setupReactTests");
const { runTest } = setupReactTests();

/* eslint-disable no-undef */
const { it } = global;

it("Hacker News app", () => {
  let data = JSON.parse(fs.readFileSync(__dirname + "/ServerRendering/hacker-news.json").toString());
  runTest(__dirname + "/ServerRendering/hacker-news.js", { data });
});

it("PE Functional Components benchmark", () => {
  runTest(__dirname + "/ServerRendering/pe-functional-benchmark.js");
});
