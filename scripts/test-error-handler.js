/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { CompilerDiagnostic, ErrorHandlerResult } from "../lib/errors.js";
import { prepackFileSync } from "../lib/prepack-node.js";
import invariant from "../lib/invariant.js";

let chalk = require("chalk");
let path = require("path");
let fs = require("fs");

function search(dir, relative) {
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

function runTest(name: string, code: string): boolean {
  console.log(chalk.inverse(name));

  let recover = code.includes("// recover-from-errors");
  let additionalFunctions = code.includes("// additional functions");

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
      mathRandomSeed: "0",
      onError: errorHandler.bind(null, recover ? "Recover" : "Fail", errors),
      serialize: true,
      speculate: true,
    };
    if (additionalFunctions) (options: any).additionalFunctions = ["additional1", "additional2"];
    prepackFileSync(name, options);
    if (!recover) {
      console.log(chalk.red("Serialization succeeded though it should have failed"));
      return false;
    }
  } catch (e) {
    // We expect serialization to fail, so catch the error and continue
  }
  if (errors.length !== expectedErrors.length) {
    console.log(chalk.red(`Expected ${expectedErrors.length} errors, but found ${errors.length}`));
    return false;
  }

  for (let i = 0; i < expectedErrors.length; ++i) {
    for (let prop in expectedErrors[i]) {
      let expected = expectedErrors[i][prop];
      let actual = (errors[i]: any)[prop];
      if (prop === "location") {
        if (actual) delete actual.filename;
        actual = JSON.stringify(actual);
        expected = JSON.stringify(expected);
      }
      if (expected !== actual) {
        console.log(chalk.red(`Error ${i + 1}: Expected ${expected} errors, but found ${actual}`));
        return false;
      }
    }
  }

  return true;
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

  console.log("Passed:", `${passed}/${total}`, (Math.round(passed / total * 100) || 0) + "%");
  return failed === 0;
}

if (!run()) process.exit(1);
