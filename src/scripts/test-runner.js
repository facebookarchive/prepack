/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import Serializer from "../serializer/index.js";
import { IsIntrospectionError } from  "../methods/index.js";

let chalk = require("chalk");
let path  = require("path");
let fs    = require("fs");
let vm    = require("vm");

function search(dir, relative) {
  let tests = [];

  for (let name of fs.readdirSync(dir)) {
    let loc = path.join(dir, name);
    let stat = fs.statSync(loc);

    if (stat.isFile()) {
      tests.push({
        file: fs.readFileSync(loc, "utf8"),
        name: path.join(relative, name)
      });
    } else if (stat.isDirectory()) {
      tests = tests.concat(search(loc, path.join(relative, name)));
    }
  }

  return tests;
}

let tests = search(`${__dirname}/../../test/serializer`, "test/serializer");

function exec(code: string): string {
  let script = new vm.Script(`var global = this; var self = this; ${code}; // keep newline here as code may end with comment
report(inspect());`, { cachedDataProduced: false });

  let result = "";
  let logOutput = "";
  script.runInNewContext({
    setTimeout: setTimeout,
    setInterval: setInterval,
    report: function(s) {
      result = s;
    },
    console: {
      log(...s) {
        logOutput += "\n" + s.join("");
      }
    }
  });
  return result + logOutput;
}

class Success {}

function runTest(name: string, code: string): boolean {
  console.log(chalk.inverse(name));
  let compatibility = code.includes("// jsc") ? "jsc" : undefined;
  let realmOptions = { partial: true, compatibility };
  let initializeMoreModules = code.includes("// initialize more modules");
  let serializerOptions = { initializeMoreModules, internalDebug: true };
  if (code.includes("// throws introspection error")) {
    let onError = (realm, e) => {
      if (IsIntrospectionError(realm, e))
        throw new Success();
    };
    try {
      let serialized = new Serializer(realmOptions, serializerOptions).init(name, code, "", false, onError);
      if (!serialized) {
        console.log(chalk.red("Error during serialization"));
      } else {
        console.log(chalk.red("Test should have caused introspection error!"));
      }
    } catch (err) {
      if (err instanceof Success) return true;
      console.log("Test should have caused introspection error, but instead caused a different internal error!");
      console.log(err);
    }
    return false;
  } else if (code.includes("// no effect")) {
    try {
      let serialized = new Serializer(realmOptions, serializerOptions).init(name, code);
      if (!serialized) {
        console.log(chalk.red("Error during serialization!"));
        return false;
      }
      if (!serialized.code.trim()) {
        return true;
      }
      console.log(chalk.red("Generated code should be empty but isn't!"));
      console.log(chalk.underline("original code"));
      console.log(code);
      console.log(chalk.underline(`generated code`));
      console.log(serialized.code);
    } catch (err) {
      console.log(err);
    }
    return false;
  } else {
    let expected, actual;
    let codeIterations = [];
    let marker = "// does not contain:";
    let to_find = "";
    let find_pos = -1;
    if (code.includes(marker)) {
      let start_pos = code.indexOf(marker);
      to_find = code.substring(start_pos + marker.length, code.indexOf("\n", start_pos));
      find_pos = start_pos + marker.length + to_find.length;
    }
    try {
      expected = exec(`(function () {${code} // keep newline here as code may end with comment
}).call(this);`);

      let i = 0;
      let max = 4;
      let oldCode = code;
      for (; i < max; i++) {
        let serialized = new Serializer(realmOptions, serializerOptions).init(name, oldCode);
        if (!serialized) {
          console.log(chalk.red("Error during serialization!"));
          break;
        }
        let newCode = serialized.code;
        codeIterations.push(newCode);
        if (find_pos !== -1 && newCode.indexOf(to_find, find_pos) !== -1) {
          console.log(chalk.red("Output contains forbidden string: " + to_find));
          break;
        }
        actual = exec(newCode);
        if (expected !== actual) {
          console.log(chalk.red("Output mismatch!"));
          break;
        }
        if (oldCode === newCode) {
          // The generated code reached a fixed point!
          return true;
        }
        oldCode = newCode;
      }
      if (i === max) {
        console.log(chalk.red(`Code generation did not reach fixed point after ${max} iterations!`));
      }
    } catch (err) {
      console.log(err);
    }
    console.log(chalk.underline("original code"));
    console.log(code);
    console.log(chalk.underline("output of inspect() on original code"));
    console.log(expected);
    for (let i = 0; i < codeIterations.length; i++) {
      console.log(chalk.underline(`generated code in iteration ${i}`));
      console.log(codeIterations[i]);
    }
    console.log(chalk.underline("output of inspect() on last generated code iteration"));
    console.log(actual);
    return false;
  }
}
function run() {
  let failed = 0;
  let passed = 0;
  let total  = 0;

  for (let test of tests) {
    // filter hidden files
    if (path.basename(test.name)[0] === ".") continue;
    if (test.name.endsWith("~")) continue;

    total++;
    if (runTest(test.name, test.file))
      passed++;
    else
      failed++;
  }

  console.log("Passed:", `${passed}/${total}`, (Math.round((passed / total) * 100) || 0) + "%");
  return failed === 0;
}

if (!run())
  process.exit(1);
