/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { CompilerDiagnostic, type ErrorHandlerResult, FatalError } from "../lib/errors.js";
import type { BabelNodeSourceLocation } from "@babel/types";
import { prepackSources } from "../lib/prepack-standalone.js";

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

let tests = search(`${__dirname}/../facebook/test`, "facebook/test");

let errors: Map<BabelNodeSourceLocation, CompilerDiagnostic>;
let errorList: Array<CompilerDiagnostic>;
function errorHandler(diagnostic: CompilerDiagnostic): ErrorHandlerResult {
  if (diagnostic.location) errors.set(diagnostic.location, diagnostic);
  else errorList.push(diagnostic);
  return "Recover";
}

function runTest(name: string, code: string): boolean {
  console.log(chalk.inverse(name));
  try {
    errors = new Map();
    errorList = [];
    let modelName = name + ".model";
    let sourceMapName = name + ".map";
    let modulesName = name + ".modules";
    let sourceCode = fs.readFileSync(name, "utf8");
    let modelCode = fs.existsSync(modelName) ? fs.readFileSync(modelName, "utf8") : undefined;
    let sourceMap = fs.existsSync(sourceMapName) ? fs.readFileSync(sourceMapName, "utf8") : undefined;
    let modulesString = fs.existsSync(modulesName) ? JSON.parse(fs.readFileSync(modulesName, "utf8")) : undefined;
    let sources = [];
    if (modelCode) {
      sources.push({ filePath: modelName, fileContents: modelCode });
    }
    sources.push({ filePath: name, fileContents: sourceCode, sourceMapContents: sourceMap });

    let options = {
      internalDebug: true,
      compatibility: "jsc-600-1-4-17",
      mathRandomSeed: "0",
      errorHandler,
      serialize: true,
      modulesToInitialize: modulesString || (modelCode ? undefined : "ALL"),
      sourceMaps: !!sourceMap,
    };
    let serialized = prepackSources(sources, options);
    let new_map = serialized.map; // force source maps to get computed
    if (!new_map) console.error(chalk.red("No source map"));
    if (!serialized) {
      console.error(chalk.red("Error during serialization"));
      return false;
    } else {
      return true;
    }
  } catch (e) {
    if (!(e instanceof FatalError)) console.error(e);
    return false;
  } finally {
    for (let [loc, error] of errors) {
      console.error(
        `${error.severity}: ${loc.source || ""} ${loc.start.line}:${loc.start.column + 1} ${error.errorCode} ${
          error.message
        }`
      );
    }
    for (let error of errorList) {
      console.error(`${error.severity}: ${error.errorCode} ${error.message}`);
    }
  }
}

function run() {
  let failed = 0;
  let passed = 0;
  let total = 0;

  for (let test of tests) {
    if (!test.name.endsWith(".js")) continue;

    total++;
    if (runTest(test.name, test.file)) passed++;
    else failed++;
  }

  console.log("Passed:", `${passed}/${total}`, (Math.floor((passed / total) * 100) || 0) + "%");
  return failed === 0;
}

if (!run()) process.exit(1);
