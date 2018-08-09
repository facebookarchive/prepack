/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

const generate = require("@babel/generator").default;
const { sample } = require("testcheck");
const { genProgram } = require("./gen");
const { divider } = require("./report");

Error.stackTraceLimit = Infinity;

const genCode = genProgram.then(program => generate(program).code);
const samples = sample(genCode);

console.log(divider);
samples.forEach(e => {
  console.log(e);
  console.log(divider);
});
