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

  for (let name of fs.readdirSync(dir)) {
    let loc = path.join(dir, name);
    let stat = fs.statSync(loc);

    if (stat.isFile()) {
      tests.push({
        file: fs.readFileSync(loc, "utf8"),
        path: path.join(relative, name),
        name: name,
      });
    } else if (stat.isDirectory()) {
      tests = tests.concat(search(loc, path.join(relative, name)));
    }
  }

  return tests;
}

let tests = search(`${__dirname}/../test/source-maps`, "test/source-maps");

function errorHandler(diagnostic: CompilerDiagnostic): ErrorHandlerResult {
  let loc = diagnostic.location;
  if (loc) console.log(`${loc.start.line}:${loc.start.column + 1} ${diagnostic.errorCode} ${diagnostic.message}`);
  else console.log(`unknown location: ${diagnostic.errorCode} ${diagnostic.message}`);
  return "Fail";
}

function generateTest(name: string, test_path: string, code: string): boolean {
  console.log(chalk.inverse(name));
  let newCode1, newMap1, newCode2, newMap2;
  try {
    let s = prepackFileSync([test_path], {
      internalDebug: true,
      errorHandler: errorHandler,
      sourceMaps: true,
      serialize: true,
    });
    if (!s) {
      process.exit(1);
      invariant(false);
    }
    newCode1 = s.code;
    fs.writeFileSync(name + ".new1.js", newCode1);
    newMap1 = s.map;
    fs.writeFileSync(name + ".new1.js.map", JSON.stringify(newMap1));
    s = prepackFileSync([name + ".new1.js"], {
      compatibility: "node-source-maps",
      inputSourceMapFilenames: [name + ".new1.js.map"],
      internalDebug: true,
      errorHandler: errorHandler,
      sourceMaps: true,
      serialize: true,
    });
    if (!s) {
      process.exit(1);
      invariant(false);
    }
    newCode2 = s.code + "\nthis.f();\n\n//# sourceMappingURL=" + name + ".new2.js.map\n";
    fs.writeFileSync(name + ".new2.js", newCode2);
    newMap2 = s.map;
    fs.writeFileSync(name + ".new2.js.map", JSON.stringify(newMap2));
    return true;
  } catch (err) {
    console.log(err);
  }
  console.log(chalk.underline("original code"));
  console.log(code);
  console.log(chalk.underline("generated code 1"));
  console.log(newCode1);
  console.log(chalk.underline("newMap 1"));
  console.log(newMap1);
  console.log(chalk.underline("generated code 2"));
  console.log(newCode2);
  console.log(chalk.underline("newMap 2"));
  console.log(newMap2);

  return false;
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
    if (generateTest(test.name, test.path, test.file)) passed++;
    else failed++;
  }

  console.log("Generated:", `${passed}/${total}`, (Math.floor((passed / total) * 100) || 0) + "%");
  return failed === 0;
}

if (!run()) process.exit(1);
