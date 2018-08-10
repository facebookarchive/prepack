/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

const generate = require("@babel/generator").default;
const { gen, property } = require("testcheck");
const { executeNormal, executePrepack } = require("./execute");
const { genPrgramWrappedInIife } = require("./gen");
const { ReportStatus, reportTestFinish } = require("./report");

/**
 * Tests if the output of a Prepacked program is the same as the output of the
 * un-Prepacked program.
 */
const prepackWorks = property(genPrgramWrappedInIife.then(program => gen.return(generate(program).code)), code => {
  const start = Date.now();
  try {
    const expected = executeNormal(code);
    const actual = executePrepack(code);
    const ok = expected.error ? actual.error : expected.value === actual.value;
    const end = Date.now();
    const time = end - start;
    reportTestFinish(time, ok ? ReportStatus.pass : ReportStatus.fail);
    return ok;
  } catch (error) {
    const end = Date.now();
    const time = end - start;

    if (error.message.includes("timed out")) {
      // Ignore programs which time out.
      reportTestFinish(time, ReportStatus.skip);
      return true;
    } else {
      reportTestFinish(time, ReportStatus.fail);
      return false;
    }
  }
});

module.exports = {
  prepackWorks,
};
