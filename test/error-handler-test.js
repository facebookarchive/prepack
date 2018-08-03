/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { search, runTest } from "../scripts/test-error-handler.js";
const { it, expect } = global;

let tests = search(`${__dirname}/error-handler`, "test/error-handler");

for (let test of tests) {
  it(test.name, () => {
    runTest(test.name, test.file);
  })
}
