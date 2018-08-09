/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

const setupDebuggerTests = require("./setupDebuggerTests");
const { runTest } = setupDebuggerTests();

/* eslint-disable no-undef */
const { it } = global;

it("debugger-breakpoint-test", done => {
  runTest(
    "Breakpoint Test 1",
    [],
    ["test/debugger/sample1.js"],
    ["breakpoint add test/debugger/sample1.js 8", "run", "run"],
    ["Breakpoint: test/debugger/sample1.js 8:2"],
    done
  );
});
