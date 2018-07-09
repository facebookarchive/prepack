/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { type CompilerDiagnostic, type ErrorHandlerResult, FatalError } from "../lib/errors.js";
import { prepackFileSync } from "../lib/prepack-node.js";
import invariant from "../lib/invariant.js";

let chalk = require("chalk");
let path = require("path");
let fs = require("fs");

/* eslint-disable no-undef */
const { expect } = global;

export function search(dir, relative) {
  let tests = [];

  if (fs.existsSync(dir)) {
    for (let name of fs.readdirSync(dir)) {
      let loc = path.join(dir, name);
      let stat = fs.statSync(loc);

      if (stat.isFile()) {
        tests.push({
          file: fs.readFileSync(loc, "utf8"),
          name: path.join(relative, name),
        });
      } else if (stat.isDirectory()) {
        tests = tests.concat(search(loc, path.join(relative, name)));
      }
    }
  }

  return tests;
}

let tests = search(`${__dirname}/../test/error-handler`, "test/error-handler");

function errorHandler(
  retval: ErrorHandlerResult,
  errors: Array<CompilerDiagnostic>,
  error: CompilerDiagnostic
): ErrorHandlerResult {
  errors.push(error);
  return retval;
}

export function runTest(name: string, code: string) {
  let recover = code.includes("// recover-from-errors");
  let delayUnsupportedRequires = code.includes("// delay unsupported requires");
  let compatibility = code.includes("// jsc") ? "jsc-600-1-4-17" : undefined;

  let expectedErrors = code.match(/\/\/\s*expected errors:\s*(.*)/);
  invariant(expectedErrors);
  invariant(expectedErrors.length > 1);
  expectedErrors = expectedErrors[1];
  expectedErrors = eval(expectedErrors); // eslint-disable-line no-eval
  invariant(expectedErrors.constructor === Array);

  let errors = [];
  try {
    let options = {
      internalDebug: false,
      delayUnsupportedRequires,
      mathRandomSeed: "0",
      errorHandler: errorHandler.bind(null, recover ? "Recover" : "Fail", errors),
      serialize: true,
      initializeMoreModules: false,
      compatibility,
    };
    let result = prepackFileSync([name], options);
    if (!recover) {
      expect(result).toBeUndefined()
    }
  } catch (e) {
    expect(e).toBeInstanceOf(FatalError);
  }

  expect(errors).toMatchSnapshot(name);
}

function run() {
  let failed = 0;
  let passed = 0;
  let total = 0;

  for (let test of tests) {
    // filter hidden files
    if (path.basename(test.name)[0] === ".") continue;
    if (test.name.endsWith("~")) continue;

    total++;
    if (runTest(test.name, test.file)) passed++;
    else failed++;
  }

  console.log("Passed:", `${passed}/${total}`, (Math.floor((passed / total) * 100) || 0) + "%");
  return failed === 0;
}

if (!run()) process.exit(1);
