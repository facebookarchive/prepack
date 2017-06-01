/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

let prepack = require("../lib/prepack-node.js").prepack;
let InitializationError = require("../lib/prepack-node.js").InitializationError;

let Serializer = require("../lib/serializer/index.js").default;
let construct_realm = require("../lib/construct_realm.js").default;
let initializeGlobals = require("../lib/globals.js").default;
let IsIntrospectionError = require("../lib/methods/index.js").IsIntrospectionError;

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

let tests = search(`${__dirname}/../test/serializer`, "test/serializer");

function exec(code) {
  let script = new vm.Script(`var global = this; var self = this; ${code}; // keep newline here as code may end with comment
report(inspect());`, { cachedDataProduced: false });

  let result = "";
  let logOutput = "";

  function write(prefix, values) {
    logOutput += "\n" + prefix + values.join("");
  }

  script.runInNewContext({
    setTimeout: setTimeout,
    setInterval: setInterval,
    clearTimeout: clearTimeout,
    clearInterval: clearInterval,
    report: function(s) {
      result = s;
    },
    console: {
      log(...s) {
        write("", s);
      },
      warn(...s) {
        write("WARN:", s);
      },
      error(...s) {
        write("ERROR:", s);
      }
    }
  });
  return result + logOutput;
}

class Success {}

function runTest(name, code) {
  console.log(chalk.inverse(name));
  let compatibility = code.includes("// jsc") ? "jsc-600-1-4-17" : undefined;
  let speculate = code.includes("// initialize more modules");
  let delayUnsupportedRequires = code.includes("// delay unsupported requires");
  let functionCloneCountMatch = code.match(/\/\/ serialized function clone count: (\d+)/);
  let options = {
    filename: name,
    compatibility,
    speculate,
    delayUnsupportedRequires,
    internalDebug: true,
    serialize: true,
    uniqueSuffix: ""
  };
  if (code.includes("// throws introspection error")) {
    let onError = (realm, e) => {
      if (IsIntrospectionError(realm, e))
        throw new Success();
    };
    try {
      let realmOptions = { serialize: true, compatibility, uniqueSuffix: "" };
      let realm = construct_realm(realmOptions);
      initializeGlobals(realm);
      let serializerOptions = { initializeMoreModules: speculate, delayUnsupportedRequires, internalDebug: true };
      let serializer = new Serializer(realm, serializerOptions);
      let serialized = serializer.init(name, code, "", false, onError);
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
  } else if (code.includes("// cannot serialize")) {
    try {
      prepack(code, options);
    } catch (err) {
      if (err instanceof InitializationError) {
        return true;
      }
    }
    console.log(chalk.red("Test should have caused error during serialization!"));
    return false;
  } else if (code.includes("// no effect")) {
    try {
      let serialized = prepack(code, options);
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
    let markersToFind = [];
    for (let [positive, marker] of [[true, "// does contain:"], [false, "// does not contain:"]]) {
      if (code.includes(marker)) {
        let i = code.indexOf(marker);
        let value = code.substring(i + marker.length, code.indexOf("\n", i));
        markersToFind.push({ positive, value, start: i + marker.length });
      }
    }
    let unique = 27277;
    let oldUniqueSuffix = "";
    try {
      expected = exec(`(function () {${code} // keep newline here as code may end with comment
}).call(this);`);

      let i = 0;
      let max = 4;
      let oldCode = code;
      for (; i < max; i++) {
        let newUniqueSuffix = `_unique${unique++}`;
        options.uniqueSuffix = newUniqueSuffix;
        let serialized = prepack(oldCode, options);
        if (!serialized) {
          console.log(chalk.red("Error during serialization!"));
          break;
        }
        let newCode = serialized.code;
        codeIterations.push(newCode);
        let markersIssue = false;
        for (let { positive, value, start } of markersToFind) {
          let found = newCode.indexOf(value, start) !== -1;
          if (found !== positive) {
            console.log(chalk.red(`Output ${positive ? "does not contain" : "contains"} forbidden string: ${value}`));
            markersIssue = true;
          }
        }
        if (markersIssue) break;
        actual = exec(newCode);
        if (expected !== actual) {
          console.log(chalk.red("Output mismatch!"));
          break;
        }
        // Test the number of clone functions generated with the inital prepack call
        if (i === 0 && functionCloneCountMatch) {
          let functionCount = parseInt(functionCloneCountMatch[1], 10);
          if (functionCount !== serialized.statistics.functionClones) {
            console.log(chalk.red(`Code generation serialized an unexpected number of clone functions. Expected: ${functionCount}, Got: ${serialized.statistics.functionClones}`));
            break;
          }
        }
        if (oldCode.replace(new RegExp(oldUniqueSuffix, "g"), "") === newCode.replace(new RegExp(newUniqueSuffix, "g"), "") || delayUnsupportedRequires) {
          // The generated code reached a fixed point!
          return true;
        }
        oldCode = newCode;
        oldUniqueSuffix = newUniqueSuffix;
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
    if (test.file.includes("// skip")) continue;

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
