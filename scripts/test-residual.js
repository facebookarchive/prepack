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
let ThrowCompletion = require("../lib/completions.js").ThrowCompletion;
let FatalError = require("../lib/errors.js").FatalError;

let chalk = require("chalk");
let path = require("path");
let fs = require("fs");
let vm = require("vm");
let os = require("os");
let minimist = require("minimist");
const EOL = os.EOL;

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

function runTest(name, code, args) {
  let realmOptions = { residual: true };
  let sources = [{ filePath: name, fileContents: code }];
  console.log(chalk.inverse(name));
  if (code.includes("// throws introspection error")) {
    try {
      let realm = construct_realm(realmOptions);
      initializeGlobals(realm);
      let result = realm.$GlobalEnv.executePartialEvaluator(sources);
      if (result instanceof ThrowCompletion) throw result.value;
    } catch (err) {
      if (err instanceof FatalError) return true;
      console.error(err);
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
      try {
        expected = exec(`(function () { ${code}; // keep newline here as code may end with comment
        return __result; }).call(this);`);
      } catch (e) {
        expected = "" + e;
      }

      let i = 0;
      let max = 4;
      let oldCode = code;
      for (; i < max; i++) {
        let realm = construct_realm(realmOptions);
        initializeGlobals(realm);
        let result = realm.$GlobalEnv.executePartialEvaluator(sources);
        if (result instanceof ThrowCompletion) throw result.value;
        if (result instanceof AbruptCompletion) throw result;
        let newCode = result.code;
        if (args.verbose && i === 0) console.log(newCode);
        codeIterations.push(newCode);
        let markersIssue = false;
        for (let { positive, value, start } of markersToFind) {
          let found = newCode.indexOf(value, start) !== -1;
          if (found !== positive) {
            console.error(chalk.red(`Output ${positive ? "does not contain" : "contains"} forbidden string: ${value}`));
            markersIssue = true;
          }
        }
        if (markersIssue) break;
        try {
          actual = exec(`(function () { ${newCode}; // keep newline here as code may end with comment
            return __result; }).call(this);`);
        } catch (e) {
          actual = "" + e;
        }
        if (expected !== actual) {
          console.error(chalk.red("Output mismatch!"));
          break;
        }
        if (oldCode === newCode) {
          // The generated code reached a fixed point!
          return true;
        }
        oldCode = newCode;
      }
      if (i === max) {
        console.error(chalk.red(`Code generation did not reach fixed point after ${max} iterations!`));
      }
    } catch (err) {
      console.error(err);
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
function run(args) {
  let failed = 0;
  let passed = 0;
  let total = 0;

  for (let test of tests) {
    // filter hidden files
    if (path.basename(test.name)[0] === ".") continue;
    if (test.name.endsWith("~")) continue;
    if (test.file.includes("// skip")) continue;
    if (!test.name.includes(args.filter)) continue;

    total++;
    if (runTest(test.name, test.file, args)) passed++;
    else failed++;
  }

  console.log("Passed:", `${passed}/${total}`, (Math.floor((passed / total) * 100) || 0) + "%");
  return failed === 0;
}

// Object to store all command line arguments
class ProgramArgs {
  verbose: boolean;
  filter: string;
  constructor(verbose: boolean, filter: string) {
    this.verbose = verbose;
    this.filter = filter; //lets user choose specific test files, runs all tests if omitted
  }
}

// Execution of tests begins here
function main(): number {
  try {
    let args = argsParse();
    if (!run(args)) {
      process.exit(1);
    } else {
      return 0;
    }
  } catch (e) {
    if (e instanceof ArgsParseError) {
      console.error("Illegal argument: %s.\n%s", e.message, usage());
    } else {
      console.error(e);
    }
    return 1;
  }
  return 0;
}

// Helper function to provide correct usage information to the user
function usage(): string {
  return `Usage: ${process.argv[0]} ${process.argv[1]} ` + EOL + `[--verbose] [--filter <string>]`;
}

// NOTE: inheriting from Error does not seem to pass through an instanceof
// check
class ArgsParseError {
  message: string;
  constructor(message: string) {
    this.message = message;
  }
}

// Parses through the command line arguments and throws errors if usage is incorrect
function argsParse(): ProgramArgs {
  let parsedArgs = minimist(process.argv.slice(2), {
    string: ["filter"],
    boolean: ["verbose"],
    default: {
      verbose: false,
      filter: "",
    },
  });
  if (typeof parsedArgs.verbose !== "boolean") {
    throw new ArgsParseError("verbose must be a boolean (either --verbose or not)");
  }
  if (typeof parsedArgs.filter !== "string") {
    throw new ArgsParseError(
      "filter must be a string (relative path from serialize directory) (--filter abstract/Residual.js)"
    );
  }
  let programArgs = new ProgramArgs(parsedArgs.verbose, parsedArgs.filter);
  return programArgs;
}

main();
