/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

let FatalError = require("../lib/errors.js").FatalError;
let prepackString = require("../lib/prepack-node.js").prepackString;

let Serializer = require("../lib/serializer/index.js").default;
let construct_realm = require("../lib/construct_realm.js").default;
let initializeGlobals = require("../lib/globals.js").default;

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

let tests = search(`${__dirname}/../test/serializer`, "test/serializer");

function exec(code) {
  let script = new vm.Script(
    `var global = this; var self = this; ${code}; // keep newline here as code may end with comment
report(inspect());`,
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
  console.log(chalk.inverse(name));
  let compatibility = code.includes("// jsc") ? "jsc-600-1-4-17" : undefined;
  let speculate = code.includes("// initialize more modules");
  let delayUnsupportedRequires = code.includes("// delay unsupported requires");
  let functionCloneCountMatch = code.match(/\/\/ serialized function clone count: (\d+)/);
  let options = {
    compatibility,
    speculate,
    delayUnsupportedRequires,
    internalDebug: true,
    serialize: true,
    uniqueSuffix: "",
  };
  if (code.includes("// throws introspection error")) {
    try {
      let realmOptions = { serialize: true, compatibility, uniqueSuffix: "" };
      let realm = construct_realm(realmOptions);
      initializeGlobals(realm);
      let serializerOptions = { initializeMoreModules: speculate, delayUnsupportedRequires, internalDebug: true };
      let serializer = new Serializer(realm, serializerOptions);
      let sources = [{ filePath: name, fileContents: code }];
      let serialized = serializer.init(sources, false);
      if (!serialized) {
        console.log(chalk.red("Error during serialization"));
      } else {
        console.log(chalk.red("Test should have caused introspection error!"));
      }
    } catch (err) {
      if (err instanceof FatalError) return true;
      console.log("Test should have caused introspection error, but instead caused a different internal error!");
      console.log(err);
    }
    return false;
  } else if (code.includes("// cannot serialize")) {
    try {
      prepackString(name, code, "", options);
    } catch (err) {
      if (err instanceof FatalError) {
        return true;
      }
    }
    console.log(chalk.red("Test should have caused error during serialization!"));
    return false;
  } else if (code.includes("// no effect")) {
    try {
      let serialized = prepackString(name, code, "", options);
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
  } else if (code.includes("// Copies of ")) {
    let marker = "// Copies of ";
    let searchStart = code.indexOf(marker);
    let searchEnd = code.indexOf(":", searchStart);
    let value = code.substring(searchStart + marker.length, searchEnd);
    let count = parseInt(code.substring(searchEnd + 1, code.indexOf("\n", searchStart)), 10);
    try {
      let serialized = prepackString(name, code, "", options);
      if (!serialized) {
        console.log(chalk.red("Error during serialization!"));
        return false;
      }
      let regex = new RegExp(value, "gi");
      let matches = serialized.code.match(regex);
      if (!matches || matches.length !== count) {
        console.log(
          chalk.red(`Wrong number of occurrances of ${value} got ${matches ? matches.length : 0} instead of ${count}`)
        );
        return false;
      }
    } catch (err) {
      console.log(chalk.red("Test caused an error"));
      return false;
    }
    return true;
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
      let anyDelayedValues = false;
      for (; i < max; i++) {
        let newUniqueSuffix = `_unique${unique++}`;
        options.uniqueSuffix = newUniqueSuffix;
        let serialized = prepackString(name, oldCode, "", options);
        if (serialized.statistics && serialized.statistics.delayedValues > 0) anyDelayedValues = true;
        if (!serialized) {
          console.log(chalk.red("Error during serialization!"));
          break;
        }
        let newCode = serialized.code;
        codeIterations.push(newCode);
        if (args.verbose) console.log(newCode);
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
          if (serialized.statistics && functionCount !== serialized.statistics.functionClones) {
            console.log(
              chalk.red(
                `Code generation serialized an unexpected number of clone functions. Expected: ${functionCount}, Got: ${serialized
                  .statistics.functionClones}`
              )
            );
            break;
          }
        }
        if (
          oldCode.replace(new RegExp(oldUniqueSuffix, "g"), "") ===
            newCode.replace(new RegExp(newUniqueSuffix, "g"), "") ||
          delayUnsupportedRequires
        ) {
          // The generated code reached a fixed point!
          return true;
        }
        oldCode = newCode;
        oldUniqueSuffix = newUniqueSuffix;
      }
      if (anyDelayedValues) {
        // TODO: Make delayed initializations logic more sophisticated in order to still reach a fixed point.
        return true;
      } else if (i === max) {
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
function run(args) {
  let failed = 0;
  let passed = 0;
  let total = 0;

  for (let test of tests) {
    // filter hidden files
    if (path.basename(test.name)[0] === ".") continue;
    if (test.name.endsWith("~")) continue;
    if (test.file.includes("// skip")) continue;
    //only run specific tests if desired
    if (!test.name.includes(args.filter)) continue;

    total++;
    if (runTest(test.name, test.file, args)) passed++;
    else failed++;
  }

  console.log("Passed:", `${passed}/${total}`, (Math.round(passed / total * 100) || 0) + "%");
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
      console.log("Illegal argument: %s.\n%s", e.message, usage());
    } else {
      console.log(e);
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
      "filter must be a string (relative path from serialize dirctory) (--filter abstract/Residual.js)"
    );
  }
  let programArgs = new ProgramArgs(parsedArgs.verbose, parsedArgs.filter);
  return programArgs;
}

main();
