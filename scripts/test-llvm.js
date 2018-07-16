/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { prepackFileSync } from "../lib/prepack-node.js";
import invariant from "../lib/invariant.js";

let chalk = require("chalk");
let path = require("path");
let fs = require("fs");
let child_process = require("child_process");

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

let tests = search(`${__dirname}/../test/llvm`, "test/llvm");

function runTest(name: string, code: string): boolean {
  console.log(chalk.inverse(name));

  let stdoutMatch = code.match(/\/\/\s*stdout:\s*(.*)/);
  let expectedStdout = stdoutMatch && stdoutMatch.length > 1 ? stdoutMatch[1] : "";
  invariant(expectedStdout);

  let llvmIR: string;
  try {
    let options = { emitLLVM: true };
    let result = prepackFileSync([name], options);
    invariant(result.llvmModule);
    llvmIR = result.llvmModule.print();
  } catch (e) {
    console.error(chalk.red(e.message));
    console.error(e.stack);
    return false;
  }

  let actualStdout;
  try {
    actualStdout = child_process.execFileSync("lli", [], {
      input: llvmIR,
      timeout: 1000,
      encoding: "utf8",
    });
    invariant(typeof actualStdout === "string");
  } catch (e) {
    return false;
  }

  if (actualStdout !== expectedStdout) {
    console.error(chalk.red(`Error: Expected test to print "${expectedStdout}", but saw "${actualStdout}"`));
    return false;
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

  console.log("Passed:", `${passed}/${total}`, (Math.floor((passed / total) * 100) || 0) + "%");
  return failed === 0;
}

if (!run()) process.exit(1);
