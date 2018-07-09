/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

const { search, runTest } = require("../lib/test-error-handler.js");
const { it, expect } = global;

it("thing", () => {
  expect(true).toBe(false);
})

/*let tests = search(`${__dirname}/error-handler`, "error-handler");

console.error("hi");
console.error(tests.length);
for (let test of tests) {
  console.log(test.name);
  it(test.name, () => {
    runTest(test.file);
  })
}*/
