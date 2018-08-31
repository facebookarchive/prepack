/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

const util = require("util");
const chalk = require("chalk");
const { check } = require("testcheck");
const { executeNormal, executePrepack } = require("./execute");
const { prepackWorks } = require("./property");
const { passIcon, failIcon, divider } = require("./report");

console.log(divider);
const test = check(prepackWorks, { numTests: 1000, maxSize: 200 });
console.log(divider);

const { seed, numTests } = test;
const plural = numTests === 1 ? "" : "s";

if (test.result === true) {
  // Yay! No failures.
  console.log(`${passIcon} Passed after running ${numTests} test${plural} ` + `with seed ${seed}`);
} else {
  // Uh, oh. A failure!
  console.error(`${failIcon} Failed after running ${numTests} test${plural} ` + `with seed ${seed}`);
  if (test.result !== false) {
    console.error(chalk.red(test.result.stack));
  }

  // Log the shrunk failure case and the args which caused it to fail.
  test.shrunk.smallest.forEach((code, i) => {
    console.error(divider);
    console.error(code);
    console.error(divider);
    const expected = executeNormal(code);
    const actual = executePrepack(code);
    console.error(`${chalk.dim("Expected:")} ${inspect(expected.value)}`);
    console.error(`  ${chalk.dim("Actual:")} ${inspect(actual.value)}`);
  });
  console.error(divider);
}

function inspect(value) {
  return util.inspect(value, { colors: true });
}
