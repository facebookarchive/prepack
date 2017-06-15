/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

let construct_realm = require("../lib/construct_realm.js").default;
let initializeGlobals = require("../lib/globals.js").default;
let AbruptCompletion = require("../lib/completions.js").AbruptCompletion;
let IntrospectionThrowCompletion = require("../lib/completions.js").IntrospectionThrowCompletion;
let ThrowCompletion = require("../lib/completions.js").ThrowCompletion;

let chalk = require("chalk");
let path = require("path");
let fs = require("fs");
let vm = require("vm");

function search(dir, relative) {
  let tests = [];

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

  return tests;
}

let tests = search(`${__dirname}/../test/residual`, "test/residual");

function exec(code) {
  let script = new vm.Script(
    `var global = this; var self = this; var __result = ${code} // keep newline here as code may end with comment
; report(__result);`,
    { cachedDataProduced: false }
  );

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
      },
    },
  });
  return result + logOutput;
}

function runTest(name, code) {
  let realmOptions = { residual: true };
  console.log(chalk.inverse(name));
  if (code.includes("// throws introspection error")) {
    try {
      let realm = construct_realm(realmOptions);
      initializeGlobals(realm);
      let result = realm.$GlobalEnv.executePartialEvaluator(name, code);
      if (result instanceof IntrospectionThrowCompletion) return true;
      if (result instanceof ThrowCompletion) throw result.value;
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
    try {
      expected = exec(`(function () { ${code}; // keep newline here as code may end with comment
return __result; }).call(this);`);

      let i = 0;
      let max = 4;
      let oldCode = code;
      for (; i < max; i++) {
        let realm = construct_realm(realmOptions);
        initializeGlobals(realm);
        let result = realm.$GlobalEnv.executePartialEvaluator(name, code);
        if (result instanceof ThrowCompletion) throw result.value;
        if (result instanceof AbruptCompletion) throw result;
        let newCode = result.code;
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
        actual = exec(`(function () { ${newCode}; // keep newline here as code may end with comment
          return __result; }).call(this);`);
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
  let total = 0;

  for (let test of tests) {
    // filter hidden files
    if (path.basename(test.name)[0] === ".") continue;
    if (test.name.endsWith("~")) continue;
    if (test.file.includes("// skip")) continue;

    total++;
    if (runTest(test.name, test.file)) passed++;
    else failed++;
  }

  console.log("Passed:", `${passed}/${total}`, (Math.round(passed / total * 100) || 0) + "%");
  return failed === 0;
}

if (!run()) process.exit(1);
