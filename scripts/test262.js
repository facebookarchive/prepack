/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */
import path from "path";
import fs from "fs";
import yaml from "js-yaml";
import Integrator from "test262-integrator";

import tty from "tty";
import minimist from "minimist";

import initializeGlobals from "../lib/globals.js";
import { AbruptCompletion, ThrowCompletion } from "../lib/completions.js";
import { DetachArrayBuffer } from "../lib/methods/arraybuffer.js";
import construct_realm from "../lib/construct_realm.js";
import { ObjectValue, StringValue } from "../lib/values/index.js";
import { Realm, ExecutionContext } from "../lib/realm.js";
import { To } from "../lib/singletons.js";
import { Get } from "../lib/methods/get.js";

const filters = yaml.safeLoad(fs.readFileSync(path.join(__dirname, "./test262-filters.yml"), "utf8"));

class TestAttrs {
  description: string;
  esid: ?string;
  es5id: ?string;
  es6id: ?string;
  features: ?(string[]);
  includes: ?(string[]);
  info: ?string;
  flags: TestFlags;
  negative: TestAttrsNegative;
  skip: boolean;
}

class TestAttrsNegative {
  phase: string;
  type: string;
}

class TestFlags {
  generated: boolean;
  onlyStrict: boolean;
  noStrict: boolean;
  async: boolean;
}

class TestObject {
  file: string;
  contents: string;
  copyright: string;
  scenario: string; // "default", "strict mode", ...
  attrs: TestAttrs;
}

class Result {
  pass: boolean;
  error: ?Error;
  skip: ?boolean;
  constructor(pass, error, skip): void {
    this.pass = pass;
    this.error = error;
    this.skip = skip;
  }
}

class TestResult extends TestObject {
  result: Result;
}

function execute(timeout: number, test: TestObject): Result {
  let { contents, attrs, file, scenario } = test;
  let { realm } = createRealm(timeout);

  let strict = scenario === "strict mode";

  // Run the test.
  try {
    try {
      let completion = realm.$GlobalEnv.execute(contents, file);
      if (completion instanceof ThrowCompletion) throw completion;
      if (completion instanceof AbruptCompletion) {
        return new Result(false, new Error("Unexpected abrupt completion"));
      }
    } catch (err) {
      if (err.message === "Timed out") return new Result(false, err);
      if (!attrs.negative) {
        throw err;
      }
    }

    if (attrs.negative && attrs.negative.type) {
      throw new Error("Was supposed to error with type " + attrs.negative.type + " but passed");
    }

    // succeeded
    return new Result(true);
  } catch (err) {
    if (err.value && err.value.$Prototype && err.value.$Prototype.intrinsicName === "SyntaxError.prototype") {
      // Skip test
      return new Result(false, null, true);
    }

    let stack = err.stack;
    if (attrs.negative && attrs.negative.type) {
      let type = attrs.negative.type;
      if (err && err instanceof ThrowCompletion && (Get(realm, err.value, "name"): any).value === type) {
        // Expected an error and got one.
        return new Result(true);
      } else {
        // Expected an error, but got something else.
        if (err && err instanceof ThrowCompletion) {
          return new Result(false, err);
        } else {
          let err2 = new Error(`Expected an error, but got something else: ${err.message}`);
          return new Result(false, err2);
        }
      }
    } else {
      // Not expecting an error, but got one.
      try {
        if (err && err instanceof ThrowCompletion) {
          let interpreterStack: void | string;

          if (err.value instanceof ObjectValue) {
            if (err.value.$HasProperty("stack")) {
              interpreterStack = To.ToStringPartial(realm, Get(realm, err.value, "stack"));
            } else {
              interpreterStack = To.ToStringPartial(realm, Get(realm, err.value, "message"));
            }
            // filter out if the error stack is due to async
            if (interpreterStack.includes("async ")) {
              // Skip test
              return new Result(false, null, true);
            }
          } else if (err.value instanceof StringValue) {
            interpreterStack = err.value.value;
            if (interpreterStack === "only plain identifiers are supported in parameter lists") {
              // Skip test
              return new Result(false, null, true);
            }
          }

          // Many strict-only tests involving eval check if certain SyntaxErrors are thrown.
          // Some of those would require changes to Babel to support properly, and some we should handle ourselves in Prepack some day.
          // But for now, ignore.
          if (contents.includes("eval(") && strict) {
            // Skip test
            return new Result(false, null, true);
          }

          if (interpreterStack) {
            stack = `Interpreter: ${interpreterStack}\nNative: ${err.nativeStack}`;
          }
        }
      } catch (_err) {
        stack = _err.stack;
      }

      return new Result(false, new Error(`Got an error, but was not expecting one:\n${stack}`));
    }
  }
}

function createRealm(timeout: number): { realm: Realm, $: ObjectValue } {
  // Create a new realm.
  let realm = construct_realm({
    strictlyMonotonicDateNow: true,
    timeout: timeout * 1000,
  });
  initializeGlobals(realm);
  let executionContext = new ExecutionContext();
  executionContext.realm = realm;
  realm.pushContext(executionContext);

  // Create the Host-Defined functions.
  let $ = new ObjectValue(realm);

  $.defineNativeMethod("createRealm", 0, context => {
    return createRealm(timeout).$;
  });

  $.defineNativeMethod("detachArrayBuffer", 1, (context, [buffer]) => {
    return DetachArrayBuffer(realm, buffer);
  });

  $.defineNativeMethod("evalScript", 1, (context, [sourceText]) => {
    // TODO: eval
    return realm.intrinsics.undefined;
  });

  $.defineNativeProperty("global", realm.$GlobalObject);

  $.defineNativeMethod("destroy", 0, () => realm.intrinsics.undefined);

  let glob = ((realm.$GlobalObject: any): ObjectValue);
  glob.defineNativeProperty("$262", $);
  glob.defineNativeMethod("print", 1, (context, [arg]) => {
    return realm.intrinsics.undefined;
  });

  return { realm, $ };
}

class ReportResults {
  skipped: number;
  passed: number;
  total: number;
  name: string;

  constructor(name: string) {
    this.skipped = 0;
    this.passed = 0;
    this.total = 0;
    this.name = name;
  }

  report(pass: boolean, skip: boolean): void {
    if (skip) {
      this.skipped += 1;
    } else if (pass) {
      this.passed += 1;
    }

    this.total += 1;
  }

  percentage(x: number, total: number): string {
    if (total === 0) {
      return "100%";
    }
    return ((x / total) * 100).toFixed(2) + "%";
  }

  info(title: string, x: number, y: number, force: boolean): string {
    if (!force && x === 0) {
      return "";
    }

    return `${title} ${x}/${y} (${this.percentage(x, y)})`;
  }

  formatResult(): string {
    const subtotal = this.total - this.skipped;
    const failed = subtotal - this.passed;
    return [
      `${this.name}: `,
      this.info("Ran", subtotal, this.total, true),
      this.info(", Passed", this.passed, subtotal, false),
      this.info(", Failed", failed, subtotal, false),
      this.info(", Skipped", this.skipped, this.total, false),
    ].join("");
  }

  static safeTypeReturn(map: Map<string, ReportResults>, key: string): ReportResults {
    const result = map.get(key);
    if (result instanceof ReportResults) {
      return result;
    }
    throw new Error("Wrong type set in a list of ReportResults");
  }
}

function processResults(verbose: boolean, statusFile: string, results: TestResult[]): void {
  let status = "\n";
  const foldersMap = new Map();
  const featuresMap = new Map();
  const allResults = new ReportResults("\nTotal");

  console.log("\n");

  results.forEach(({ file, scenario, attrs: { features }, result: { pass, skip, error } = {} }) => {
    // Limits the report result in a max depth of 5 folders.
    // This fits most cases for built-ins prototype methods as e.g.
    // test/built-ins/Array/prototype/sort
    const folder = path
      .dirname(file)
      .split(path.sep)
      .slice(1, 5)
      .join(path.sep);
    let folderResults: ReportResults;

    if (!foldersMap.has(folder)) {
      folderResults = new ReportResults(folder);
      foldersMap.set(folder, folderResults);
    } else {
      folderResults = ReportResults.safeTypeReturn(foldersMap, folder);
    }

    if (folderResults) {
      folderResults.report(!!pass, !!skip);
    }
    allResults.report(!!pass, !!skip);

    if (features) {
      for (let feature of features) {
        let featureResults: ReportResults;

        if (!featuresMap.has(feature)) {
          featureResults = new ReportResults(feature);
          featuresMap.set(feature, featureResults);
        } else {
          featureResults = ReportResults.safeTypeReturn(featuresMap, feature);
        }

        if (featureResults) {
          featureResults.report(!!pass, !!skip);
        }
      }
    }

    if (verbose && !skip && !pass) {
      let message = "";
      if (error && error.message) {
        message = error.message;
      }
      status += `Failed: ${file} (${scenario})\n${message}\n\n`;
    }
  });

  foldersMap.forEach(folderResults => {
    status += folderResults.formatResult();
    status += "\n";
  });

  status += "\nFeatures:\n\n";

  featuresMap.forEach(featureResults => {
    status += featureResults.formatResult();
    status += "\n";
  });

  status += allResults.formatResult();

  console.log(status);

  if (statusFile) {
    fs.writeFileSync(statusFile, status);
  }
}

class MasterProgramArgs {
  verbose: boolean;
  timeout: number;
  statusFile: string;
  paths: string[];
  testDir: string;

  constructor(verbose: boolean, timeout: number, statusFile: string, paths: string[], testDir: string) {
    this.verbose = verbose;
    this.timeout = timeout;
    this.statusFile = statusFile;
    this.paths = paths;
    this.testDir = testDir;
  }
}

function masterArgsParse(): MasterProgramArgs {
  let { _: _paths, verbose, timeout, statusFile, testDir } = minimist(process.argv.slice(2), {
    string: ["statusFile", "testDir"],
    boolean: ["verbose"],
    default: {
      testDir: ["..", "test", "test262"].join(path.sep),
      verbose: process.stdout instanceof tty.WriteStream ? false : true,
      statusFile: "",
      timeout: 10,
    },
  });

  // Test paths can be provided as "built-ins/Array", "language/statements/class", etc.
  let paths = _paths.map(p => path.join("test", p));
  if (typeof verbose !== "boolean") {
    throw new Error("verbose must be a boolean (either --verbose or not)");
  }
  if (typeof timeout !== "number") {
    throw new Error("timeout must be a number (in seconds) (--timeout 10)");
  }
  if (typeof statusFile !== "string") {
    throw new Error("statusFile must be a string (--statusFile file.txt)");
  }
  if (typeof testDir !== "string") {
    throw new Error("testDir must be a string (--testDir ../test/test262)");
  }

  return new MasterProgramArgs(verbose, timeout, statusFile, paths, testDir);
}

function usage(message: string): void {
  console.error(
    [
      `Illegal argument: ${message}`,
      `Usage: ${process.argv[0]} ${process.argv[1]}`,
      "[--verbose] (defaults to false)",
      "[--timeout <number>] (defaults to 10)",
      "[--statusFile <string>]",
      "[--testDir <string>] (defaults to ../test/test262)",
    ].join("\n")
  );
}

function main(): void {
  try {
    let { testDir, verbose, paths, statusFile, timeout } = masterArgsParse();

    // Execution
    Integrator({
      filters,
      execute: execute.bind(null, timeout),
      testDir: path.join(__dirname, testDir),
      verbose,
      paths: paths.length ? paths : null,
    })
      .then(processResults.bind(null, verbose, statusFile), err => {
        console.error(`Error running the tests: ${err}`);
        process.exit(1);
      })
      .then(() => process.exit(0));
  } catch (e) {
    usage(e.message);
    process.exit(2);
  }
}

main();
