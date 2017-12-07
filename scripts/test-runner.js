/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import invariant from "../lib/invariant.js";
let FatalError = require("../lib/errors.js").FatalError;
let prepackSources = require("../lib/prepack-node.js").prepackSources;

let Serializer = require("../lib/serializer/index.js").default;
let construct_realm = require("../lib/construct_realm.js").default;
let initializeGlobals = require("../lib/globals.js").default;
let chalk = require("chalk");
let path = require("path");
let fs = require("fs");
let vm = require("vm");
let os = require("os");
let minimist = require("minimist");
let babel = require("babel-core");
let child_process = require("child_process");
const EOL = os.EOL;
let execSpec;

function transformWithBabel(code, plugins, presets) {
  return babel.transform(code, {
    plugins: plugins,
    presets: presets,
  }).code;
}

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

const LAZY_OBJECTS_RUNTIME_NAME = "LazyObjectsRuntime";
let tests = search(`${__dirname}/../test/serializer`, "test/serializer");

// run JS subprocess
// externalSpec defines how to invoke external REPL and how to print.
//  - cmd - cmd to execute, script is piped into this.
//  - printName - name of function which can be used to print to stdout.
function execExternal(externalSpec, code) {
  // essentially the code from execInContext run through babel
  let script = `
  var global = this;
  var self = this;
  var _logOutput = "";
  function write(prefix, values) {
    _logOutput += "\\n" + prefix + values.join("");
  }
  var cachePrint = ${externalSpec.printName};
  global.console = {}
  global.console.log = function log() {
      for (var _len = arguments.length, s = Array(_len), _key = 0; _key < _len; _key++) {
        s[_key] = arguments[_key];
      }
      write("", s);
    };
    global.console.warn = function warn() {
      for (var _len2 = arguments.length, s = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        s[_key2] = arguments[_key2];
      }
      write("WARN:", s);
    };
    global.console.error = function error() {
      for (var _len3 = arguments.length, s = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
        s[_key3] = arguments[_key3];
      }
      write("ERROR:", s);
    };
  try {
    ${code}
    cachePrint(inspect() + _logOutput);
  } catch (e) {
    cachePrint(e);
  }`;

  let child = child_process.spawnSync(externalSpec.cmd, { input: script });

  let output = String(child.stdout);

  return String(output.trim());
}

function augmentCodeWithLazyObjectSupport(code, lazyRuntimeName) {
  const mockLazyObjectsSupport = `
    /* Lazy objects mock support begin */
    var ${lazyRuntimeName} = {
      _lazyObjectIds: new Map(),
      _callback: null,
      setLazyObjectInitializer: function(callback) {
        this._callback = callback;
      },
      createLazyObject: function(id) {
        var obj = {};
        this._lazyObjectIds.set(obj, id);
        return obj;
      },
      hydrateObject: function(obj) {
        const AlreadyHydratedLazyId = -1;
        const lazyId = this._lazyObjectIds.get(obj);
        if (lazyId === AlreadyHydratedLazyId) {
          return;
        }
        this._callback(obj, lazyId);
        this._lazyObjectIds.set(obj, AlreadyHydratedLazyId);
      }
    };

    var __hydrationHook = {
      get: function(target, prop) {
        ${LAZY_OBJECTS_RUNTIME_NAME}.hydrateObject(target);
        return Reflect.get(target, prop);
      },
      set: function(target, property, value, receiver) {
        ${LAZY_OBJECTS_RUNTIME_NAME}.hydrateObject(target);
        return Reflect.set(target, property, value, receiver);
      },
      has: function(target, prop) {
        ${LAZY_OBJECTS_RUNTIME_NAME}.hydrateObject(target);
        return Reflect.has(target, prop);
      },
      getOwnPropertyDescriptor: function(target, prop) {
        ${LAZY_OBJECTS_RUNTIME_NAME}.hydrateObject(target);
        return Reflect.getOwnPropertyDescriptor(target, prop);
      },
      ownKeys: function(target) {
        ${LAZY_OBJECTS_RUNTIME_NAME}.hydrateObject(target);
        return Reflect.ownKeys(target);
      },
      defineProperty: function(target, property, descriptor) {
        ${LAZY_OBJECTS_RUNTIME_NAME}.hydrateObject(target);
        return Reflect.defineProperty(target, property, descriptor);
      },
      isExtensible: function(target) {
        ${LAZY_OBJECTS_RUNTIME_NAME}.hydrateObject(target);
        return Reflect.isExtensible(target);
      },
      preventExtensions: function(target) {
        ${LAZY_OBJECTS_RUNTIME_NAME}.hydrateObject(target);
        return Reflect.preventExtensions(target);
      },
      deleteProperty: function(target, prop) {
        ${LAZY_OBJECTS_RUNTIME_NAME}.hydrateObject(target);
        return Reflect.deleteProperty(target, prop);
      },
      getPrototypeOf: function(target) {
        ${LAZY_OBJECTS_RUNTIME_NAME}.hydrateObject(target);
        return Reflect.getPrototypeOf(target);
      },
      setPrototypeOf: function(target, prototype) {
        ${LAZY_OBJECTS_RUNTIME_NAME}.hydrateObject(target);
        return Reflect.setPrototypeOf(target, prototype);
      },
      apply: function(target, thisArg, argumentsList) {
        ${LAZY_OBJECTS_RUNTIME_NAME}.hydrateObject(target);
        return Reflect.apply(target, thisArg, argumentsList);
      },
      construct: function(target, argumentsList, newTarget) {
        ${LAZY_OBJECTS_RUNTIME_NAME}.hydrateObject(target);
        return Reflect.construct(target, argumentsList, newTarget);
      }
    };
    /* Lazy objects mock support end */
  `;
  function wrapLazyObjectWithProxyHook(lazyCode) {
    const lazyObjectCreationRegex = new RegExp(`(${lazyRuntimeName}\.createLazyObject\\(\\d+\\))`, "g");
    return lazyCode.replace(lazyObjectCreationRegex, "new Proxy($1, __hydrationHook)");
  }
  code = wrapLazyObjectWithProxyHook(code);
  return `${mockLazyObjectsSupport}
    ${code}; // keep newline here as code may end with comment`;
}

// run code in a seperate context
function execInContext(code) {
  let script = new vm.Script(
    `var global = this;
    var self = this;
    ${code}
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
  return (result + logOutput).trim();
}

function parseFunctionOrderings(code: string): Array<number> {
  const orders = [];
  const functionOrderPattern = /Function ordering: (\d+)/g;
  let match;
  while ((match = functionOrderPattern.exec(code)) != null) {
    orders.push(match[1]);
  }
  return orders;
}

function verifyFunctionOrderings(code: string): boolean {
  const orders = parseFunctionOrderings(code);
  for (let i = 1; i < orders.length; ++i) {
    invariant(orders[i] !== orders[i - 1]);
    if (orders[i] < orders[i - 1]) {
      console.log(chalk.red(`Funtion ordering is not preserved: function ${orders[i - 1]} is before ${orders[i]}`));
      return false;
    }
  }
  return true;
}

function runTest(name, code, options, args) {
  console.log(chalk.inverse(name) + " " + JSON.stringify(options));
  let compatibility = code.includes("// jsc") ? "jsc-600-1-4-17" : undefined;
  let initializeMoreModules = code.includes("// initialize more modules");
  let compileJSXWithBabel = code.includes("// babel:jsx");
  let delayUnsupportedRequires = code.includes("// delay unsupported requires");
  let functionCloneCountMatch = code.match(/\/\/ serialized function clone count: (\d+)/);
  options = Object.assign({}, options, {
    compatibility,
    debugNames: args.debugNames,
    initializeMoreModules,
    delayUnsupportedRequires,
    errorHandler: diag => "Fail",
    internalDebug: true,
    serialize: true,
    uniqueSuffix: "",
  });
  if (code.includes("// inline expressions")) options.inlineExpressions = true;
  if (code.includes("// simple closures")) options.simpleClosures = true;
  if (code.includes("// do not inline expressions")) options.inlineExpressions = false;
  if (code.includes("// omit invariants")) options.omitInvariants = true;
  if (code.includes("// additional functions")) options.additionalFunctions = ["additional1", "additional2"];
  if (code.includes("// exceeds stack limit")) options.maxStackDepth = 10;
  if (code.includes("// react")) options.reactEnabled = true;
  if (code.includes("// throws introspection error")) {
    try {
      let realmOptions = {
        serialize: true,
        compatibility,
        uniqueSuffix: "",
        errorHandler: diag => "Fail",
        maxStackDepth: options.maxStackDepth,
      };
      let realm = construct_realm(realmOptions);
      initializeGlobals(realm);
      let serializerOptions = {
        initializeMoreModules,
        delayUnsupportedRequires,
        internalDebug: true,
        additionalFunctions: options.additionalFunctions,
        lazyObjectsRuntime: options.lazyObjectsRuntime,
      };
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
      prepackSources([{ filePath: name, fileContents: code, sourceMapContents: "" }], options);
    } catch (err) {
      if (err instanceof FatalError) {
        return true;
      }
    }
    console.log(chalk.red("Test should have caused error during serialization!"));
    return false;
  } else if (code.includes("// no effect")) {
    try {
      let serialized = prepackSources([{ filePath: name, fileContents: code, sourceMapContents: "" }], options);
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
      let serialized = prepackSources([{ filePath: name, fileContents: code, sourceMapContents: "" }], options);
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
      console.log(err);
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
    let addedCode = "";
    let injectAtRuntime = "// add at runtime:";
    if (code.includes(injectAtRuntime)) {
      let i = code.indexOf(injectAtRuntime);
      addedCode = code.substring(i + injectAtRuntime.length, code.indexOf("\n", i));
    }
    if (args.es5) {
      code = transformWithBabel(code, [], [["env", { forceAllTransforms: true, modules: false }]]);
    }
    let unique = 27277;
    let oldUniqueSuffix = "";
    let expectedCode = code;
    if (compileJSXWithBabel) {
      expectedCode = transformWithBabel(expectedCode, ["transform-react-jsx"]);
    }
    try {
      try {
        expected = execInContext(`${addedCode}\n(function () {${expectedCode} // keep newline here as code may end with comment
  }).call(this);`);
      } catch (e) {
        expected = "" + e;
      }

      let i = 0;
      let max = addedCode ? 1 : 4;
      let oldCode = code;
      let anyDelayedValues = false;
      for (; i < max; i++) {
        let newUniqueSuffix = `_unique${unique++}`;
        options.uniqueSuffix = newUniqueSuffix;
        let serialized = prepackSources([{ filePath: name, fileContents: code, sourceMapContents: "" }], options);
        if (serialized.statistics && serialized.statistics.delayedValues > 0) anyDelayedValues = true;
        if (!serialized) {
          console.log(chalk.red("Error during serialization!"));
          break;
        }
        let newCode = serialized.code;
        if (compileJSXWithBabel) {
          newCode = transformWithBabel(newCode, ["transform-react-jsx"]);
        }
        let markersIssue = false;
        for (let { positive, value, start } of markersToFind) {
          let found = newCode.indexOf(value, start) !== -1;
          if (found !== positive) {
            console.log(chalk.red(`Output ${positive ? "does not contain" : "contains"} forbidden string: ${value}`));
            markersIssue = true;
          }
        }
        if (markersIssue) break;
        let codeToRun = addedCode + newCode;
        if (!execSpec && options.lazyObjectsRuntime !== undefined) {
          codeToRun = augmentCodeWithLazyObjectSupport(codeToRun, args.lazyObjectsRuntime);
        }
        if (args.verbose) console.log(codeToRun);
        codeIterations.push(codeToRun);
        if (args.es5) {
          codeToRun = transformWithBabel(codeToRun, [], [["env", { forceAllTransforms: true, modules: false }]]);
        }
        try {
          if (execSpec) {
            actual = execExternal(execSpec, codeToRun);
          } else {
            actual = execInContext(codeToRun);
          }
        } catch (e) {
          // always compare strings.
          actual = "" + e;
        }
        if (expected !== actual) {
          console.log(chalk.red("Output mismatch!"));
          break;
        }
        if (!verifyFunctionOrderings(codeToRun)) {
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
      if (i === 1) return true;
      if (i === max) {
        if (anyDelayedValues) {
          // TODO #835: Make delayed initializations logic more sophisticated in order to still reach a fixed point.
          return true;
        }
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

function prepareReplExternalSepc(procPath) {
  if (!fs.existsSync(procPath)) {
    throw new ArgsParseError(`runtime ${procPath} does not exist`);
  }
  // find out how to print
  let script = `
    if (typeof (console) !== 'undefined' && console.log !== undefined) {
      console.log('console.log')
    }
    else if (typeof('print') !== 'undefined') {
      print('print')
    }`;
  let out = child_process.spawnSync(procPath, { input: script });
  let output = String(out.stdout);
  if (output.trim() === "") {
    throw new ArgsParseError(`could not figure out how to print in inferior repl ${procPath}`);
  }
  return { printName: output.trim(), cmd: procPath.trim() };
}

function run(args) {
  let failed = 0;
  let passed = 0;
  let total = 0;
  if (args.outOfProcessRuntime !== "") {
    execSpec = prepareReplExternalSepc(args.outOfProcessRuntime);
  }

  for (let test of tests) {
    // filter hidden files
    if (path.basename(test.name)[0] === ".") continue;
    if (test.name.endsWith("~")) continue;
    if (test.file.includes("// skip")) continue;
    if (args.es5 && test.file.includes("// es6")) continue;
    //only run specific tests if desired
    if (!test.name.includes(args.filter)) continue;
    // Skip lazy objects mode for certain known incompatible tests, react compiler and additional-functions tests.
    const skipLazyObjects =
      test.file.includes("// skip lazy objects") ||
      test.name.includes("additional-functions") ||
      test.name.includes("react");

    for (let [delayInitializations, inlineExpressions, lazyObjectsRuntime] of [
      [false, false, undefined],
      [true, true, undefined],
      [false, false, args.lazyObjectsRuntime],
    ]) {
      if ((skipLazyObjects || args.noLazySupport) && lazyObjectsRuntime) {
        continue;
      }
      total++;
      let options = { delayInitializations, inlineExpressions, lazyObjectsRuntime };
      if (runTest(test.name, test.file, options, args)) passed++;
      else failed++;
    }
  }

  console.log("Passed:", `${passed}/${total}`, (Math.round(passed / total * 100) || 0) + "%");
  return failed === 0;
}

// Object to store all command line arguments
class ProgramArgs {
  debugNames: boolean;
  verbose: boolean;
  filter: string;
  outOfProcessRuntime: string;
  es5: boolean;
  lazyObjectsRuntime: string;
  noLazySupport: boolean;
  constructor(
    debugNames: boolean,
    verbose: boolean,
    filter: string,
    outOfProcessRuntime: string,
    es5: boolean,
    lazyObjectsRuntime: string,
    noLazySupport: boolean
  ) {
    this.debugNames = debugNames;
    this.verbose = verbose;
    this.filter = filter; //lets user choose specific test files, runs all tests if omitted
    this.outOfProcessRuntime = outOfProcessRuntime;
    this.es5 = es5;
    this.lazyObjectsRuntime = lazyObjectsRuntime;
    this.noLazySupport = noLazySupport;
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
  return (
    `Usage: ${process.argv[0]} ${process.argv[1]} ` +
    EOL +
    `[--verbose] [--filter <string>] [--outOfProcessRuntime <path>] [--es5] [--noLazySupport]`
  );
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
    string: ["filter", "outOfProcessRuntime"],
    boolean: ["debugNames", "verbose", "es5"],
    default: {
      debugNames: false,
      verbose: false,
      es5: false, // if true test marked as es6 only are not run
      filter: "",
      outOfProcessRuntime: "", // if set, assumed to be a JS runtime and is used
      // to run tests. If not a seperate node context used.
      lazyObjectsRuntime: LAZY_OBJECTS_RUNTIME_NAME,
      noLazySupport: false,
    },
  });
  if (typeof parsedArgs.debugNames !== "boolean") {
    throw new ArgsParseError("debugNames must be a boolean (either --debugNames or not)");
  }
  if (typeof parsedArgs.verbose !== "boolean") {
    throw new ArgsParseError("verbose must be a boolean (either --verbose or not)");
  }
  if (typeof parsedArgs.es5 !== "boolean") {
    throw new ArgsParseError("es5 must be a boolean (either --es5 or not)");
  }
  if (typeof parsedArgs.filter !== "string") {
    throw new ArgsParseError(
      "filter must be a string (relative path from serialize directory) (--filter abstract/Residual.js)"
    );
  }
  if (typeof parsedArgs.outOfProcessRuntime !== "string") {
    throw new ArgsParseError("outOfProcessRuntime must be path pointing to an javascript runtime");
  }
  if (typeof parsedArgs.lazyObjectsRuntime !== "string") {
    throw new ArgsParseError("lazyObjectsRuntime must be a string");
  }
  if (typeof parsedArgs.noLazySupport !== "boolean") {
    throw new ArgsParseError("noLazySupport must be a boolean (either --noLazySupport or not)");
  }
  let programArgs = new ProgramArgs(
    parsedArgs.debugNames,
    parsedArgs.verbose,
    parsedArgs.filter,
    parsedArgs.outOfProcessRuntime,
    parsedArgs.es5,
    parsedArgs.lazyObjectsRuntime,
    parsedArgs.noLazySupport
  );
  return programArgs;
}

main();
