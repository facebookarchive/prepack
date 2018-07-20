/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */
/* eslint-disable no-extend-native */

import { AbruptCompletion, ThrowCompletion } from "../lib/completions.js";
import { ObjectValue, StringValue } from "../lib/values/index.js";
import { Realm, ExecutionContext } from "../lib/realm.js";
import construct_realm from "../lib/construct_realm.js";
import initializeGlobals from "../lib/globals.js";
import { DetachArrayBuffer } from "../lib/methods/arraybuffer.js";
import { To } from "../lib/singletons.js";
import { Get } from "../lib/methods/get.js";
import invariant from "../lib/invariant.js";
import { prepackSources } from "../lib/prepack-node.js";

import yaml from "js-yaml";
import chalk from "chalk";
import path from "path";
// need to use graceful-fs for single-process code because it opens too many
// files
import fs from "graceful-fs";
import cluster from "cluster";
import os from "os";
import tty from "tty";
import minimist from "minimist";
import process from "process";
import vm from "vm";
import * as babelTypes from "@babel/types";
import traverse from "@babel/traverse";
import generate from "@babel/generator";

const EOL = os.EOL;
const cpus = os.cpus();
const numCPUs = cpus ? cpus.length : 1;
require("source-map-support").install();

type HarnessMap = { [key: string]: string };
type TestRecord = { test: TestFileInfo, result: TestResult[] };
type GroupsMap = { [key: string]: TestRecord[] };

type TestRunOptions = {|
  +timeout: number,
  +serializer: boolean | "abstract-scalar",
|};

// A TestTask is a task for a worker process to execute, which contains a
// single test to run
class TestTask {
  static sentinel: string = "TestTask";
  type: string;
  file: TestFileInfo;

  constructor(file: TestFileInfo) {
    this.type = TestTask.sentinel;
    this.file = file;
  }

  // eslint-disable-next-line flowtype/no-weak-types
  static fromObject(obj: Object): TestTask {
    // attempt to coerce the object into a test task
    if ("file" in obj && typeof obj.file === "object") {
      return new TestTask(TestFileInfo.fromObject(obj.file));
    } else {
      throw new Error(`Cannot be converted to a TestTask: ${JSON.stringify(obj)}`);
    }
  }
}

/**
 * Information about a test file to be run.
 *
 */
class TestFileInfo {
  // Location of the test on the filesystem, call fs.readFile on this
  location: string;
  isES6: boolean;
  groupName: string;

  constructor(location: string, isES6: boolean) {
    this.location = location;
    this.isES6 = isES6;
    this.groupName = path.dirname(location);
  }

  // eslint-disable-next-line flowtype/no-weak-types
  static fromObject(obj: Object): TestFileInfo {
    // attempt to coerce the object into a TestFileInfo
    if ("location" in obj && typeof obj.location === "string" && "isES6" in obj && typeof obj.isES6 === "boolean") {
      return new TestFileInfo(obj.location, obj.isES6);
    } else {
      throw new Error(`Cannot be converted to a TestFileInfo: ${JSON.stringify(obj)}`);
    }
  }
}

// A Message sent by a worker to the master to say that it has finished its
// current task successfully
class DoneMessage {
  static sentinel: string = "DoneMessage";
  type: string;
  test: TestFileInfo;
  testResults: TestResult[];

  constructor(test: TestFileInfo, testResult: TestResult[] = []) {
    this.type = DoneMessage.sentinel;
    this.test = test;
    this.testResults = testResult;
  }

  // eslint-disable-next-line flowtype/no-weak-types
  static fromObject(obj: Object): DoneMessage {
    if (!("type" in obj && typeof obj.type === "string" && obj.type === DoneMessage.sentinel)) {
      throw new Error(`Cannot be converted to a DoneMessage: ${JSON.stringify(obj)}`);
    }
    if (!("test" in obj && typeof obj.test === "object")) {
      throw new Error("A DoneMessage must have a test");
    }
    let msg = new DoneMessage(obj.test);
    if ("testResults" in obj && typeof obj.testResults === "object" && Array.isArray(obj.testResults)) {
      msg.testResults = obj.testResults;
    }
    return msg;
  }
}

class ErrorMessage {
  static sentinel: string = "ErrorMessage";
  type: string;
  err: Error;

  constructor(err: Error) {
    this.type = ErrorMessage.sentinel;
    this.err = err;
  }

  // eslint-disable-next-line flowtype/no-weak-types
  static fromObject(obj: Object): ErrorMessage {
    if (!("type" in obj && typeof obj.type === "string" && obj.type === ErrorMessage.sentinel)) {
      throw new Error(`Cannot be converted to an ErrorMessage: ${JSON.stringify(obj)}`);
    }
    if (!("err" in obj && typeof obj.err === "object")) {
      throw new Error(`Cannot be converted to an ErrorMessage: ${JSON.stringify(obj)}`);
    }
    return new ErrorMessage(obj.err);
  }
}

/**
 * TestResult contains information about a test that ran.
 */
class TestResult {
  passed: boolean;
  strict: boolean;
  err: ?Error;

  constructor(passed: boolean, strict: boolean, err: ?Error = null) {
    this.passed = passed;
    this.strict = strict;
    this.err = err;
  }
}

// A Message sent by the master to workers to say that there is nothing more
// to do
class QuitMessage {
  static sentinel: string = "QuitMessage";
  type: string;

  constructor() {
    this.type = QuitMessage.sentinel;
  }

  static fromObject(obj): QuitMessage {
    return new QuitMessage();
  }
}

class BannerData {
  info: string;
  es5id: string;
  es6id: string;
  description: string;
  flags: string[];
  features: string[];
  includes: string[];
  // eslint-disable-next-line flowtype/no-weak-types
  negative: Object;

  constructor() {
    this.info = "";
    this.es5id = "";
    this.es6id = "";
    this.description = "";
    this.flags = [];
    this.features = [];
    this.includes = [];
    this.negative = {};
  }

  // eslint-disable-next-line flowtype/no-weak-types
  static fromObject(obj: Object): BannerData {
    let bd = new BannerData();
    if ("info" in obj && typeof obj.info === "string") {
      bd.info = obj.info;
    }
    if ("es5id" in obj && typeof obj.es5id === "string") {
      bd.es5id = obj.es5id;
    }
    if ("es6id" in obj && typeof obj.es6id === "string") {
      bd.es6id = obj.es6id;
    }
    if ("description" in obj && typeof obj.description === "string") {
      bd.description = obj.description;
    }
    if ("flags" in obj && typeof obj.flags === "object" && Array.isArray(obj.flags)) {
      bd.flags = obj.flags;
    }
    if ("features" in obj && typeof obj.features === "object" && Array.isArray(obj.features)) {
      bd.features = obj.features;
    }
    if ("includes" in obj && typeof obj.includes === "object" && Array.isArray(obj.includes)) {
      bd.includes = obj.includes;
    }
    if ("negative" in obj && typeof obj.negative === "object") {
      bd.negative = obj.negative;
    }
    return bd;
  }
}

class MasterProgramArgs {
  verbose: boolean;
  timeout: number;
  bailAfter: number;
  cpuScale: number;
  statusFile: string;
  filterString: string;
  singleThreaded: boolean;
  relativeTestPath: string;
  serializer: boolean | "abstract-scalar";
  expectedES5: number;
  expectedES6: number;
  expectedTimeouts: number;

  constructor(
    verbose: boolean,
    timeout: number,
    bailAfter: number,
    cpuScale: number,
    statusFile: string,
    filterString: string,
    singleThreaded: boolean,
    relativeTestPath: string,
    serializer: boolean | "abstract-scalar",
    expectedES5: number,
    expectedES6: number,
    expectedTimeouts: number
  ) {
    this.verbose = verbose;
    this.timeout = timeout;
    this.bailAfter = bailAfter;
    this.cpuScale = cpuScale;
    this.statusFile = statusFile;
    this.filterString = filterString;
    this.singleThreaded = singleThreaded;
    this.relativeTestPath = relativeTestPath;
    this.serializer = serializer;
    this.expectedES5 = expectedES5;
    this.expectedES6 = expectedES6;
    this.expectedTimeouts = expectedTimeouts;
  }
}

class WorkerProgramArgs {
  relativeTestPath: string;
  timeout: number;
  serializer: boolean | "abstract-scalar";

  constructor(relativeTestPath: string, timeout: number, serializer: boolean | "abstract-scalar") {
    this.timeout = timeout;
    this.serializer = serializer;
    this.relativeTestPath = relativeTestPath;
  }
}

// NOTE: inheriting from Error does not seem to pass through an instanceof
// check
class ArgsParseError {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

if (!("toJSON" in Error.prototype)) {
  // $FlowFixMe this needs to become defined for Error to be serialized
  Object.defineProperty(Error.prototype, "toJSON", {
    // eslint-disable-line
    value: function() {
      let alt = {};
      Object.getOwnPropertyNames(this).forEach(function(key) {
        alt[key] = this[key];
      }, this);
      return alt;
    },
    configurable: true,
    writable: true,
  });
}

main();

function main(): number {
  try {
    if (cluster.isMaster) {
      let args = masterArgsParse();
      masterRun(args);
    } else if (cluster.isWorker) {
      let args = workerArgsParse();
      workerRun(args);
    } else {
      throw new Error("Not a master or a worker");
    }
  } catch (e) {
    if (e instanceof ArgsParseError) {
      console.error("Illegal argument: %s.\n%s", e.message, usage());
    } else {
      console.error(e);
    }
    process.exit(1);
  }
  return 0;
}

function usage(): string {
  return (
    `Usage: ${process.argv[0]} ${process.argv[1]} ` +
    EOL +
    `[--verbose] [--timeout <number>] [--bailAfter <number>] ` +
    EOL +
    `[--cpuScale <number>] [--statusFile <string>] [--singleThreaded] [--relativeTestPath <string>]` +
    EOL +
    `[--expectedCounts <es5pass,es6pass,timeouts>]`
  );
}

function masterArgsParse(): MasterProgramArgs {
  let parsedArgs = minimist(process.argv.slice(2), {
    string: ["statusFile", "relativeTestPath"],
    boolean: ["verbose", "singleThreaded"],
    default: {
      verbose: process.stdout instanceof tty.WriteStream ? false : true,
      statusFile: "",
      timeout: 10,
      cpuScale: 1,
      bailAfter: Infinity,
      singleThreaded: false,
      relativeTestPath: "/../test/test262",
      serializer: false,
      expectedCounts: "11943,5641,2",
    },
  });
  let filterString = parsedArgs._[0];
  if (typeof parsedArgs.verbose !== "boolean") {
    throw new ArgsParseError("verbose must be a boolean (either --verbose or not)");
  }
  let verbose = parsedArgs.verbose;
  if (typeof parsedArgs.timeout !== "number") {
    throw new ArgsParseError("timeout must be a number (in seconds) (--timeout 10)");
  }
  let timeout = parsedArgs.timeout;
  if (typeof parsedArgs.bailAfter !== "number") {
    throw new ArgsParseError("bailAfter must be a number (--bailAfter 10)");
  }
  let bailAfter = parsedArgs.bailAfter;
  if (typeof parsedArgs.cpuScale !== "number") {
    throw new ArgsParseError("cpuScale must be a number (--cpuScale 0.5)");
  }
  let cpuScale = parsedArgs.cpuScale;
  if (typeof parsedArgs.statusFile !== "string") {
    throw new ArgsParseError("statusFile must be a string (--statusFile file.txt)");
  }
  let statusFile = parsedArgs.statusFile;
  if (typeof parsedArgs.singleThreaded !== "boolean") {
    throw new ArgsParseError("singleThreaded must be a boolean (either --singleThreaded or not)");
  }
  let singleThreaded = parsedArgs.singleThreaded;
  if (typeof parsedArgs.relativeTestPath !== "string") {
    throw new ArgsParseError("relativeTestPath must be a string (--relativeTestPath /../test/test262)");
  }
  let relativeTestPath = parsedArgs.relativeTestPath;
  if (!(typeof parsedArgs.serializer === "boolean" || parsedArgs.serializer === "abstract-scalar")) {
    throw new ArgsParseError(
      "serializer must be a boolean or must be the string 'abstract-scalar' (--serializer or --serializer abstract-scalar)"
    );
  }
  let serializer = parsedArgs.serializer;
  if (typeof parsedArgs.expectedCounts !== "string") {
    throw new ArgsParseError("expectedCounts must be a string (--expectedCounts 11944,5566,2");
  }
  let expectedCounts = parsedArgs.expectedCounts.split(",").map(x => Number(x));
  let programArgs = new MasterProgramArgs(
    verbose,
    timeout,
    bailAfter,
    cpuScale,
    statusFile,
    filterString,
    singleThreaded,
    relativeTestPath,
    serializer,
    expectedCounts[0],
    expectedCounts[1],
    expectedCounts[2]
  );
  if (programArgs.filterString) {
    // if filterstring is provided, assume that verbosity is desired
    programArgs.verbose = true;
  }
  return programArgs;
}

function workerArgsParse(): WorkerProgramArgs {
  let parsedArgs = minimist(process.argv.slice(2), {
    default: {
      relativeTestPath: "/../test/test262",
      timeout: 10,
      serializer: false,
    },
  });
  if (typeof parsedArgs.relativeTestPath !== "string") {
    throw new ArgsParseError("relativeTestPath must be a string (--relativeTestPath /../test/test262)");
  }
  if (typeof parsedArgs.timeout !== "number") {
    throw new ArgsParseError("timeout must be a number (in seconds) (--timeout 10)");
  }
  if (!(typeof parsedArgs.serializer === "boolean" || parsedArgs.serializer === "abstract-scalar")) {
    throw new ArgsParseError(
      "serializer must be a boolean or must be the string 'abstract-scalar' (--serializer or --serializer abstract-scalar)"
    );
  }
  return new WorkerProgramArgs(parsedArgs.relativeTestPath, parsedArgs.timeout, parsedArgs.serializer);
}

function masterRun(args: MasterProgramArgs) {
  let testPath = `${__dirname}` + args.relativeTestPath + "/test";
  let tests = getFilesSync(testPath);
  // remove tests that don't need to be run
  if (args.filterString) tests = tests.filter(test => test.location.includes(args.filterString));
  const originalTestLength = tests.length;
  tests = tests.filter(test => testFilterByMetadata(test));
  let groups: GroupsMap = {};

  // Now that all the tasks are ready, start up workers to begin processing
  // if single threaded, use that route instead
  if (args.singleThreaded) {
    masterRunSingleProcess(args, groups, tests, originalTestLength - tests.length);
  } else {
    masterRunMultiProcess(args, groups, tests, originalTestLength - tests.length);
  }
}

function masterRunSingleProcess(
  args: MasterProgramArgs,
  groups: GroupsMap,
  tests: TestFileInfo[],
  numFiltered: number
): void {
  console.log(`Running ${tests.length} tests as a single process`);
  // print out every 5 percent (more granularity than multi-process because multi-process
  // runs a lot faster)
  const granularity = Math.floor(tests.length / 20);
  let harnesses = getHarnesses(args.relativeTestPath);
  let numLeft = tests.length;
  for (let t of tests) {
    let options: TestRunOptions = {
      timeout: args.timeout,
      serializer: args.serializer,
    };
    handleTest(t, harnesses, options, (err, results) => {
      if (err) {
        if (args.verbose) {
          console.error(err);
        }
      } else {
        let ok = handleTestResults(groups, t, results);
        if (!ok) {
          // handleTestResults returns false if a failure threshold was exceeded
          throw new Error("Too many test failures");
        }
        let progress = getProgressBar(numLeft, tests.length, granularity);
        if (progress) {
          console.log(progress);
        }
      }
      numLeft--;
      if (numLeft === 0) {
        // all done
        process.exit(handleFinished(args, groups, numFiltered));
      }
    });
  }
}

function masterRunMultiProcess(
  args: MasterProgramArgs,
  groups: GroupsMap,
  tests: TestFileInfo[],
  numFiltered: number
): void {
  if (!cluster.on) {
    // stop flow errors on "cluster.on"
    throw new Error("cluster is malformed");
  }
  const granularity = Math.floor(tests.length / 10);
  const originalTestLength = tests.length;
  // Fork workers.
  const numWorkers = Math.max(1, Math.floor(numCPUs * args.cpuScale));
  console.log(`Master starting up, forking ${numWorkers} workers`);
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  let exitCount = 0;
  cluster.on("exit", (worker, code, signal) => {
    if (code !== 0) {
      console.log(`Worker ${worker.process.pid} died with ${signal || code}. Restarting...`);
      cluster.fork();
    } else {
      exitCount++;
      if (exitCount === numWorkers) {
        process.exit(handleFinished(args, groups, numFiltered));
      }
    }
  });

  const giveTask = worker => {
    // grab another test to run and give it to the child process
    if (tests.length === 0) {
      worker.send(new QuitMessage());
    } else {
      worker.send(new TestTask(tests.pop()));
    }
  };

  cluster.on("message", (worker, message, handle) => {
    switch (message.type) {
      case ErrorMessage.sentinel:
        let errMsg = ErrorMessage.fromObject(message);
        // just skip the error, thus skipping that test
        if (args.verbose) {
          console.error(`An error occurred in worker #${worker.process.pid}:`);
          console.error(errMsg.err);
        }
        giveTask(worker);
        break;
      case DoneMessage.sentinel:
        let done = DoneMessage.fromObject(message);
        let ok = handleTestResults(groups, done.test, done.testResults);
        if (!ok) {
          // bail
          killWorkers(cluster.workers);
          handleFinished(args, groups, numFiltered);
          process.exit(1);
        }
        giveTask(worker);
        let progress = getProgressBar(tests.length, originalTestLength, granularity);
        if (progress) {
          console.log(progress);
        }
        break;
      default:
        throw new Error(`Master got an unexpected message: ${JSON.stringify(message)}`);
    }
  });

  cluster.on("online", worker => {
    giveTask(worker);
  });
}

function handleFinished(args: MasterProgramArgs, groups: GroupsMap, earlierNumSkipped: number): number {
  let numPassed = 0;
  let numPassedES5 = 0;
  let numPassedES6 = 0;
  let numFailed = 0;
  let numFailedES5 = 0;
  let numFailedES6 = 0;
  let numSkipped = earlierNumSkipped;
  let numTimeouts = 0;
  let failed_groups = [];
  for (let group in groups) {
    // count some totals
    let group_passed = 0;
    let group_failed = 0;
    let group_es5_passed = 0;
    let group_es5_failed = 0;
    let group_es6_passed = 0;
    let group_es6_failed = 0;
    let groupName = path.relative(path.join(__dirname, "..", "..", "test"), group);
    let msg = "";
    let errmsg = "";
    msg += `${groupName}: `;
    for (let t of groups[group]) {
      let testName = path.relative(group, t.test.location);
      let all_passed = true;
      let was_skipped = true;
      for (let testResult of t.result) {
        was_skipped = false;
        if (!testResult.passed) {
          all_passed = false;
          if (args.verbose) {
            errmsg +=
              create_test_message(testName, testResult.passed, testResult.err, t.test.isES6, testResult.strict) + EOL;
          }
          if (testResult.err && testResult.err.message === "Timed out") {
            numTimeouts++;
          }
        }
      }
      if (was_skipped) {
        numSkipped++;
      } else if (all_passed) {
        group_passed++;
        if (t.test.isES6) {
          group_es6_passed++;
        } else {
          group_es5_passed++;
        }
      } else {
        group_failed++;
        if (t.test.isES6) {
          group_es6_failed++;
        } else {
          group_es5_failed++;
        }
      }
    }
    msg +=
      `Passed: ${group_passed} / ${group_passed + group_failed} ` +
      `(${toPercentage(group_passed, group_passed + group_failed)}%) ` +
      chalk.yellow("(es5)") +
      `: ${group_es5_passed} / ` +
      `${group_es5_passed + group_es5_failed} ` +
      `(${toPercentage(group_es5_passed, group_es5_passed + group_es5_failed)}%) ` +
      chalk.yellow("(es6)") +
      `: ${group_es6_passed} / ` +
      `${group_es6_passed + group_es6_failed} ` +
      `(${toPercentage(group_es6_passed, group_es6_passed + group_es6_failed)}%)`;
    if (args.verbose) {
      console.log(msg);
      if (errmsg) {
        console.error(errmsg);
      }
    }
    if (group_es5_failed + group_es6_failed > 0) {
      failed_groups.push(msg);
    }

    numPassed += group_passed;
    numPassedES5 += group_es5_passed;
    numPassedES6 += group_es6_passed;
    numFailed += group_failed;
    numFailedES5 += group_es5_failed;
    numFailedES6 += group_es6_failed;
  }
  let status =
    `=== RESULTS ===` +
    EOL +
    `Passes: ${numPassed} / ${numPassed + numFailed} ` +
    `(${toPercentage(numPassed, numPassed + numFailed)}%)` +
    EOL +
    `ES5 passes: ${numPassedES5} / ${numPassedES5 + numFailedES5} ` +
    `(${toPercentage(numPassedES5, numPassedES5 + numFailedES5)}%) ` +
    EOL +
    `ES6 passes: ${numPassedES6} / ${numPassedES6 + numFailedES6} ` +
    `(${toPercentage(numPassedES6, numPassedES6 + numFailedES6)}%)` +
    EOL +
    `Skipped: ${numSkipped}` +
    EOL +
    `Timeouts: ${numTimeouts}` +
    EOL;
  console.log(status);
  if (failed_groups.length !== 0) {
    console.log("Groups with failures:");
    for (let groupMessage of failed_groups) {
      console.log(groupMessage);
    }
  }
  if (args.statusFile) {
    fs.writeFileSync(args.statusFile, status);
  }

  // exit status
  if (
    !args.filterString &&
    (numPassedES5 < args.expectedES5 || numPassedES6 < args.expectedES6 || numTimeouts > args.expectedTimeouts)
  ) {
    console.error(chalk.red("Overall failure. Expected more tests to pass!"));
    process.exit(1);
    invariant(false);
  } else {
    // use 0 to avoid the npm error messages
    return 0;
  }
}

function getProgressBar(currentTestLength: number, originalTestLength: number, granularity: number): string {
  if (currentTestLength % granularity === 0 && currentTestLength !== 0) {
    // print out a percent of tests completed to keep the user informed
    return `Running... ${toPercentage(originalTestLength - currentTestLength, originalTestLength)}%`;
  } else {
    return "";
  }
}

// Returns false if test processing should stop.
function handleTestResults(groups: GroupsMap, test: TestFileInfo, testResults: TestResult[]): boolean {
  // test results are in, add it to its corresponding group
  if (!(test.groupName in groups)) {
    groups[test.groupName] = [];
  }
  groups[test.groupName].push({ test: test, result: testResults });
  return true;
}

// $FlowFixMe cluster.Worker is marked as not exported by the node API by flow.
function killWorkers(workers: { [index: string]: cluster.Worker }): void {
  for (let workerID in workers) {
    workers[workerID].kill();
  }
}

function toPercentage(x: number, total: number): number {
  if (total === 0) {
    return 100;
  }
  return Math.floor((x / total) * 100);
}

function create_test_message(name: string, success: boolean, err: ?Error, isES6: boolean, isStrict: boolean): string {
  const checkmark = chalk.green("\u2713");
  const xmark = chalk.red("\u2717");
  let msg = "\t";
  msg += (success ? checkmark : xmark) + " ";
  msg += `${isES6 ? chalk.yellow("(es6) ") : ""}${isStrict ? "(strict)" : "(nostrict)"}: ${name}`;
  if (!success) {
    invariant(err, "Error must be non null if success is false");
    if (err.message) {
      // split the message by newline, add tabs, and join
      let parts = err.message.split(EOL);
      for (let line of parts) {
        msg += EOL + `\t\t${line}`;
      }
      msg += EOL;
    } else if (err.stack) {
      msg += JSON.stringify(err.stack);
    }
  }
  return msg;
}

function getHarnesses(relativeTestPath: string): HarnessMap {
  let harnessPath = `${__dirname}` + relativeTestPath + "/harness";
  let harnessesList = getFilesSync(harnessPath);
  // convert to a mapping from harness name to file contents
  let harnesses: HarnessMap = {};
  for (let harness of harnessesList) {
    // sync is fine, it's an initialization stage and there's not that many
    // harnesses
    harnesses[path.basename(harness.location)] = fs.readFileSync(harness.location).toString();
  }
  return harnesses;
}

function workerRun(args: WorkerProgramArgs) {
  // NOTE: all harnesses (including contents of harness files) need to be
  // used on workers. It needs to either be read from the fs once and
  // distributed via IPC or once from each process. This is the
  // "once from each process" approach.
  // get all the harnesses
  let harnesses = getHarnesses(args.relativeTestPath);
  // we're a worker, run a portion of the tests
  process.on("message", message => {
    switch (message.type) {
      case TestTask.sentinel:
        // begin executing this TestTask
        let task = TestTask.fromObject(message);
        let options: TestRunOptions = {
          timeout: args.timeout,
          serializer: args.serializer,
        };
        handleTest(task.file, harnesses, options, (err, results) => {
          handleTestResultsMultiProcess(err, task.file, results);
        });
        break;
      case QuitMessage.sentinel:
        process.exit(0);
        break;
      default:
        throw new Error(
          `Worker #${process.pid} got an unexpected message:
          ${JSON.stringify(message)}`
        );
    }
  });
}

function handleTestResultsMultiProcess(err: ?Error, test: TestFileInfo, testResults: TestResult[]): void {
  if (err) {
    process.send(new ErrorMessage(err));
  } else {
    let msg = new DoneMessage(test);
    for (let t of testResults) {
      msg.testResults.push(t);
    }
    try {
      process.send(msg);
    } catch (jsonCircularSerializationErr) {
      // JSON circular serialization, ThrowCompletion is too deep to be
      // serialized!
      // Solution, truncate the "err" field if this happens
      for (let t of msg.testResults) {
        if (t.err) {
          t.err = new Error(t.err.message);
        }
      }
      // now try again
      process.send(msg);
    }
  }
}

function handleTest(
  test: TestFileInfo,
  harnesses: HarnessMap,
  options: TestRunOptions,
  cb: (err: ?Error, testResults: TestResult[]) => void
): void {
  prepareTest(test, testFilterByContents, (err, banners, testFileContents) => {
    if (err != null) {
      cb(err, []);
      return;
    }
    if (!banners) {
      // skip this test
      cb(null, []);
    } else {
      invariant(testFileContents, "testFileContents should not be null if banners are not None");
      // filter out by flags, features, and includes
      let keepThisTest =
        filterFeatures(banners) &&
        filterNegative(banners) &&
        filterFlags(banners) &&
        filterIncludes(banners) &&
        filterDescription(banners) &&
        filterCircleCI(banners) &&
        filterSneakyGenerators(banners, testFileContents) &&
        (!options.serializer || filterReallyBigArrays(test, testFileContents));
      let testResults = [];
      if (keepThisTest) {
        // now run the test
        testResults = runTestWithStrictness(test, testFileContents, banners, harnesses, options);
      }
      cb(null, testResults);
    }
  });
}

/**
 * FIXME: this code is unsound in the presence of ENOENT (file not found)
 * This function returns nested arrays of all the file names. It can be
 * flattened at the call site, but the type hint is incorrect.
 * DON'T USE THIS FUNCTION until it is fixed to behave exactly like getFilesSync
 */
/*
function getFiles(
  filepath: string,
): Promise<TestFileInfo[]> {
  return new Promise((resolve, reject) => {
    fs.stat(filepath, (err, stat) => {
      if (err !== null) {
        reject(err);
      } else {
        if (stat.isFile()) {
          // return an array of size 1
          resolve([new TestFileInfo(filepath)]);
        } else if (stat.isDirectory()) {
          // recurse on its children
          fs.readdir(filepath, (err, files) => {
            if (err !== null) {
              reject(err);
            } else {
              // FIXME flattening bug
              // tmp is Promise<TestFileInfo[]>[] (array of promises of arrays)
              // want to flatten that into Promise<TestFileInfo[]> where each
              // promise is added to a single array
              let tmp = files.map(f => getFiles(path.join(filepath, f)));
              resolve(Promise.all(tmp));
            }
          });
        }
      }
    });
  });
}
*/

/**
 * getFilesSync returns a TestFileInfo for each file that is underneath the
 * directory ${filepath}. If ${filepath} is just a file, then it returns an
 * array of size 1.
 * This function synchronously fetches from the filesystem, as such it should
 * only be used in initialization code that only runs once.
 */
function getFilesSync(filepath: string): TestFileInfo[] {
  let stat = fs.statSync(filepath);
  if (stat.isFile()) {
    return [new TestFileInfo(filepath, false)];
  } else if (stat.isDirectory()) {
    let subFiles = fs.readdirSync(filepath);
    return flatten(
      subFiles.map(f => {
        return getFilesSync(path.join(filepath, f));
      })
    );
  } else {
    throw new Error("That type of file is not supported");
  }
}

function flatten<T>(arr: Array<Array<T>>): Array<T> {
  return arr.reduce((a, b) => {
    return a.concat(b);
  }, []);
}

/**
 * prepareTest opens the file corresponding to ${test} and calls ${cb} on the
 * results, expect the ones for which ${filterFn} returns false.
 * The value passed to ${cb} will be an error if the file could not be read,
 * or the banner data for the test if successful.
 * NOTE: if the test file contents match the filter function given, ${cb} will
 * not be called for that test.
 */
function prepareTest(
  test: TestFileInfo,
  filterFn: (test: TestFileInfo, fileContents: string) => boolean,
  cb: (err: ?Error, res: ?BannerData, testFileContents: ?string) => void
): void {
  fs.readFile(test.location, (err, contents) => {
    if (err != null) {
      cb(err, null, null);
    } else {
      let contentsStr = contents.toString();
      // check if this test should be filtered
      if (!filterFn(test, contentsStr)) {
        // skip this test
        cb(null, null, null);
      } else {
        try {
          let banners = getBanners(test, contentsStr);
          cb(null, banners, contentsStr);
        } catch (bannerParseErr) {
          cb(bannerParseErr, null, null);
        }
      }
    }
  });
}

function createRealm(timeout: number): { realm: Realm, $: ObjectValue } {
  // Create a new realm.
  let realm = construct_realm({
    strictlyMonotonicDateNow: true,
    errorHandler: () => "Fail",
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

  let glob = ((realm.$GlobalObject: any): ObjectValue);
  glob.defineNativeProperty("$262", $);
  glob.defineNativeMethod("print", 1, (context, [arg]) => {
    return realm.intrinsics.undefined;
  });

  return { realm, $ };
}

/**
 * runTest executes the test given by ${test} whose contents are
 * ${testFileContents}.
 * It returns None if the test should is skipped, otherwise it returns a
 * TestResult.
 */
function runTest(
  test: TestFileInfo,
  testFileContents: string,
  data: BannerData,
  // eslint-disable-next-line flowtype/no-weak-types
  harnesses: Object,
  strict: boolean,
  options: TestRunOptions
): ?TestResult {
  if (options.serializer) {
    return executeTestUsingSerializer(test, testFileContents, data, harnesses, strict, options);
  }

  let { realm } = createRealm(options.timeout);

  // Run the test.
  try {
    try {
      // execute the harnesss first
      for (let name of ["sta.js", "assert.js"].concat(data.includes || [])) {
        let harness = harnesses[name];
        let completion = realm.$GlobalEnv.execute(harness, name);
        if (completion instanceof ThrowCompletion) throw completion;
      }

      let completion = realm.$GlobalEnv.execute(
        (strict ? '"use strict";' + EOL : "") + testFileContents,
        test.location
      );
      if (completion instanceof ThrowCompletion) throw completion;
      if (completion instanceof AbruptCompletion)
        return new TestResult(false, strict, new Error("Unexpected abrupt completion"));
    } catch (err) {
      if (err.message === "Timed out") return new TestResult(false, strict, err);
      if (!data.negative || data.negative !== err.name) {
        throw err;
      }
    }

    if (data.negative.type) {
      throw new Error("Was supposed to error with type " + data.negative.type + " but passed");
    }

    // succeeded
    return new TestResult(true, strict);
  } catch (err) {
    // Skip syntax errors.
    if (err.value && err.value.$Prototype && err.value.$Prototype.intrinsicName === "SyntaxError.prototype") {
      return null;
    }

    let stack = err.stack;
    if (data.negative.type) {
      let type = data.negative.type;
      if (
        err &&
        err instanceof ThrowCompletion &&
        err.value instanceof ObjectValue &&
        (Get(realm, err.value, "name"): any).value === type
      ) {
        // Expected an error and got one.
        return new TestResult(true, strict);
      } else {
        // Expected an error, but got something else.
        if (err && err instanceof ThrowCompletion) {
          return new TestResult(false, strict, err);
        } else {
          return new TestResult(false, strict, new Error(`Expected an error, but got something else: ${err.message}`));
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
              return null;
            }
          } else if (err.value instanceof StringValue) {
            interpreterStack = err.value.value;
            if (interpreterStack === "only plain identifiers are supported in parameter lists") {
              return null;
            }
          }

          // Many strict-only tests involving eval check if certain SyntaxErrors are thrown.
          // Some of those would require changes to Babel to support properly, and some we should handle ourselves in Prepack some day.
          // But for now, ignore.
          if (testFileContents.includes("eval(") && strict) {
            return null;
          }

          if (interpreterStack) {
            stack = `Interpreter: ${interpreterStack}${EOL}Native: ${err.nativeStack}`;
          }
        }
      } catch (_err) {
        stack = _err.stack;
      }

      return new TestResult(false, strict, new Error(`Got an error, but was not expecting one:${EOL}${stack}`));
    }
  }
}

function executeTestUsingSerializer(
  test: TestFileInfo,
  testFileContents: string,
  data: BannerData,
  // eslint-disable-next-line flowtype/no-weak-types
  harnesses: Object,
  strict: boolean,
  options: TestRunOptions
) {
  let { timeout } = options;
  let sources = [];

  // Add the test262 intrinsics.
  sources.push({
    filePath: "test262.js",
    fileContents: `\
var $ = {
  evalScript: () => {}, // noop for now
  global,
};
var $262 = $;
var print = () => {}; // noop for now
  `,
  });

  // Add the harness files.
  for (let name of ["sta.js", "assert.js"].concat(data.includes || [])) {
    let harness = harnesses[name];
    sources.push({ filePath: name, fileContents: harness });
  }

  // Add the test file.
  sources.push({ filePath: test.location, fileContents: (strict ? '"use strict";' + EOL : "") + testFileContents });

  let result;
  try {
    result = prepackSources(sources, {
      serialize: true,
      timeout: timeout * 1000,
      errorHandler: diag => {
        if (diag.severity === "Information") return "Recover";
        if (diag.severity !== "Warning") return "Fail";
        return "Recover";
      },
      onParse: ast => {
        // Transform all statements which come from our test source file. Do not transform statements from our
        // harness files.
        if (options.serializer === "abstract-scalar") {
          ast.program.body.forEach(node => {
            if ((node.loc: any).filename === test.location) {
              transformScalarsToAbstractValues(node);
            }
          });
        }
      },
    });
  } catch (error) {
    if (error.message === "Timed out") return new TestResult(false, strict, error);
    if (error.message.includes("Syntax error")) return null;
    // Uncomment the following JS code to do analysis on what kinds of Prepack errors we get.
    //
    // ```js
    // console.error(
    //   `${error.name.replace(/\n/g, "\\n")}: ${error.message.replace(/\n/g, "\\n")} (${error.stack
    //     .match(/at .+$/gm)
    //     .slice(0, 3)
    //     .join(", ")})`
    // );
    // ```
    //
    // Analysis bash command:
    //
    // ```bash
    // yarn test-test262 --serializer 2> result.err
    // cat result.err | sort | uniq -c | sort -nr
    // ```
    return new TestResult(false, strict, new Error(`Prepack error:\n${error.stack}`));
  }

  const context = vm.createContext({
    // TODO(#2292): Workaround since Prepack serializes code that expects a global `TypedArray` class which does not
    // exist per the ECMAScript specification.
    TypedArray: Object.getPrototypeOf(Int8Array),
  });

  try {
    vm.runInContext(result.code, context, { timeout: timeout * 1000 });
  } catch (error) {
    if (error.message === "Timed out") return new TestResult(false, strict, error);
    if (data.negative && data.negative.type === error.name) {
      return new TestResult(true, strict);
    } else {
      return new TestResult(false, strict, new Error(`Runtime error:\n${error.stack}`));
    }
  }
  if (data.negative.type) {
    return new TestResult(false, strict, new Error(`Expected \`${data.negative.type}\` error.`));
  } else {
    return new TestResult(true, strict);
  }
}

const TransformScalarsToAbstractValuesVisitor = (() => {
  const t = babelTypes;

  function createAbstractCall(type, actual, { allowDuplicateNames, disablePlaceholders } = {}) {
    const args = [type, actual];
    if (allowDuplicateNames) {
      args.push(
        t.objectExpression([
          t.objectProperty(t.identifier("allowDuplicateNames"), t.booleanLiteral(!!allowDuplicateNames)),
          t.objectProperty(t.identifier("disablePlaceholders"), t.booleanLiteral(!!disablePlaceholders)),
        ])
      );
    }
    return t.callExpression(t.identifier("__abstract"), args);
  }

  const defaultOptions = {
    allowDuplicateNames: true,
    disablePlaceholders: true,
  };

  const symbolOptions = {
    // Intentionally false since two symbol calls will be referentially not equal, but Prepack will share
    // a variable.
    allowDuplicateNames: false,
    disablePlaceholders: true,
  };

  return {
    noScope: true,

    BooleanLiteral(p) {
      p.node = p.container[p.key] = createAbstractCall(
        t.stringLiteral("boolean"),
        t.stringLiteral(p.node.value.toString()),
        defaultOptions
      );
    },
    StringLiteral(p) {
      // `eval()` does not support abstract arguments and we don't care to fix that.
      if (
        p.parent.type === "CallExpression" &&
        p.parent.callee.type === "Identifier" &&
        p.parent.callee.name === "eval"
      ) {
        return;
      }
      p.node = p.container[p.key] = createAbstractCall(
        t.stringLiteral("string"),
        t.stringLiteral(JSON.stringify(p.node.value)),
        defaultOptions
      );
    },
    CallExpression(p) {
      if (p.node.callee.type === "Identifier" && p.node.callee.name === "Symbol") {
        p.node = p.container[p.key] = createAbstractCall(
          t.stringLiteral("symbol"),
          t.stringLiteral(generate(p.node).code),
          symbolOptions
        );
      }
    },
    NumericLiteral(p) {
      p.node = p.container[p.key] = createAbstractCall(
        t.stringLiteral(Number.isInteger(p.node.value) ? "integral" : "number"),
        t.stringLiteral(p.node.extra.raw),
        defaultOptions
      );
    },
  };
})();

function transformScalarsToAbstractValues(ast) {
  traverse(ast, TransformScalarsToAbstractValuesVisitor);
  traverse.cache.clear();
}

/**
 * Returns true if ${test} should be run, false otherwise
 */
function testFilterByMetadata(test: TestFileInfo): boolean {
  // filter hidden files
  if (path.basename(test.location)[0] === ".") return false;

  // emacs!
  if (test.location.includes("~")) return false;

  // SIMD isn't in JS yet
  if (test.location.includes("Simd")) return false;

  // temporarily disable intl402 tests (ES5)
  if (test.location.includes("intl402") && !test.location.includes("/Date/prototype/to")) {
    return false;
  }

  // temporarily disable tests which use realm.
  if (test.location.includes("realm")) return false;

  // temporarily disable tests which use with. (??)
  if (test.location.includes("/with/")) return false;

  // disable tests which use Atomics
  if (test.location.includes("/Atomics/")) return false;

  // disable tests which use generators
  if (test.location.includes("/generators/")) return false;
  if (test.location.includes("/yield/")) return false;

  // disable tests which use modules
  if (test.location.includes("/module-code/")) return false;

  // disable browser specific tests
  if (test.location.includes("/annexB/")) return false;

  // disable tail-call optimization tests
  if (test.location.includes("tco")) return false;

  // disable nasty unicode tests.
  if (test.location.includes("U180") || test.location.includes("u180") || test.location.includes("mongolian"))
    return false;

  // disable function toString tests.
  if (test.location.includes("Function/prototype/toString")) return false;

  // disable tests that check for detached-buffer-after-toindex
  if (test.location.includes("detached-buffer-after-toindex")) return false;

  // disable tests to check for detatched-buffer during iteration
  if (test.location.includes("detach-typedarray-in-progress.js")) return false;

  // disable broken RegExp tests
  if (test.location.includes("RegExp/S15.10.2.12_A1_T1.js")) return false;
  if (test.location.includes("RegExp/S15.10.2.12_A2_T1.js")) return false;
  if (test.location.includes("RegExp/prototype/Symbol.search/lastindex-no-restore")) return false;
  if (test.location.includes("RegExp/prototype/exec/failure-lastindex-no-access.js")) return false;
  if (test.location.includes("RegExp/prototype/exec/success-lastindex-no-access.js")) return false;

  // disable RegExp tests that use extended unicode
  if (test.location.includes("Symbol.match/builtin-success-u-return-val-groups")) return false;

  // disable SharedArrayBuffer tests
  if (test.location.includes("sharedarraybuffer") || test.location.includes("SharedArrayBuffer")) return false;

  return true;
}

function testFilterByContents(test: TestFileInfo, testFileContents: string): boolean {
  // ES6 tests (can only be verified by contents, not by metadata)
  let is_es6 = testFileContents.includes(EOL + "es6id: ");
  test.isES6 = is_es6;

  // Ignore phase: early tests because those are errors that babel should catch
  // not issues related to Prepack
  let phase_early = testFileContents.indexOf("  phase: early");
  let end_of_comment = testFileContents.indexOf("---*/");
  if (phase_early > 0 && phase_early < end_of_comment) return false;

  let esid_pending = testFileContents.indexOf("esid: pending");
  if (esid_pending > 0 && esid_pending < end_of_comment) return false;

  // disable tests that require parser to throw SyntaxError in strict Mode
  if (test.location.includes("/directive-prologue/") && testFileContents.includes("assert.throws(SyntaxError,"))
    return false;

  // disable SharedArrayBuffer tests
  if (testFileContents.includes("SharedArrayBuffer")) return false;

  return true;
}

function filterFlags(data: BannerData): boolean {
  return !data.flags.includes("async");
}

function filterFeatures(data: BannerData): boolean {
  let features = data.features;
  if (features.includes("default-parameters")) return false;
  if (features.includes("generators")) return false;
  if (features.includes("generator")) return false;
  if (features.includes("BigInt")) return false;
  if (features.includes("class-fields")) return false;
  if (features.includes("async-iteration")) return false;
  if (features.includes("Function.prototype.toString")) return false;
  if (features.includes("SharedArrayBuffer")) return false;
  if (features.includes("cross-realm")) return false;
  if (features.includes("atomics")) return false;
  if (features.includes("u180e")) return false;
  if (features.includes("Symbol.isConcatSpreadable")) return false;
  if (features.includes("IsHTMLDDA")) return false;
  if (features.includes("regexp-unicode-property-escapes")) return false;
  if (features.includes("character-class-escape-non-whitespace")) return false;
  if (features.includes("regexp-named-groups")) return false;
  if (features.includes("regexp-lookbehind")) return false;
  if (features.includes("regexp-dotall")) return false;
  if (features.includes("optional-catch-binding")) return false;
  if (features.includes("Symbol.asyncIterator")) return false;
  if (features.includes("Promise.prototype.finally")) return false;
  return true;
}

function filterNegative(data: BannerData): boolean {
  let negative = data.negative;
  if (negative.phase === "parse") return false;
  return true;
}

function filterIncludes(data: BannerData): boolean {
  // disable tail call optimization tests.
  return !data.includes.includes("tco-helper.js");
}

function filterDescription(data: BannerData): boolean {
  // For now, "Complex tests" is used in the description of some
  // encode/decodeURI tests to indicate that they are long running.
  // Filter these
  return (
    !data.description.includes("Complex tests") &&
    !data.description.includes("iterating") &&
    !data.description.includes("iterable")
  );
}

function filterCircleCI(data: BannerData): boolean {
  let skipTests = [
    "7.8.5_A1.4_T2",
    "7.8.5_A2.4_T2",
    "7.8.5_A2.1_T2",
    "7.8.5_A1.1_T2",
    "15.1.2.2_A8",
    "15.1.2.3_A6",
    "7.4_A5",
    "7.4_A6",
    "15.10.2.12_A3_T1",
    "15.10.2.12_A4_T1",
    "15.10.2.12_A5_T1",
    "15.10.2.12_A6_T1",
  ];
  let skipTests6 = ["22.1.3.1_3"];

  return !!process.env.NIGHTLY_BUILD || (skipTests.indexOf(data.es5id) < 0 && skipTests6.indexOf(data.es6id) < 0);
}

function filterSneakyGenerators(data: BannerData, testFileContents: string) {
  // There are some sneaky tests that use generators but are not labeled with
  // the "generators" or "generator" feature tag. Here we use a simple heuristic
  // to filter out tests with sneaky generators.
  if (data.features.includes("destructuring-binding")) {
    return !testFileContents.includes("function*") && !testFileContents.includes("*method");
  }
  return true;
}

function filterReallyBigArrays(test: TestFileInfo, testFileContents: string) {
  // In tests where we serialize our values disable large array serialization. Serializing arrays with gaps
  // is inefficient. Consider: https://prepack.io/repl#G4QwTgBCELwQ2gXQNwCgTwAyNhAjGhnptrgakA
  return !(
    ((test.location.includes("Array") || test.location.includes("Object")) &&
      testFileContents.includes("4294967294")) ||
    (test.location.includes("Array") && testFileContents.includes("Math.pow(2, 32)")) ||
    // Sneaky...
    test.location.includes("Array/S15.4_A1.1_T10.js")
  );
}

/**
 * Run a given ${test} whose file contents are ${testFileContents} and return
 * a list of results, one for each strictness level (strict or not).
 * If the list's length is less than 2, than the missing tests were skipped.
 */
function runTestWithStrictness(
  test: TestFileInfo,
  testFileContents: string,
  data: BannerData,
  // eslint-disable-next-line flowtype/no-weak-types
  harnesses: Object,
  options: TestRunOptions
): Array<TestResult> {
  let fn = (strict: boolean) => {
    return runTest(test, testFileContents, data, harnesses, strict, options);
  };
  if (data.flags.includes("onlyStrict")) {
    if (testFileContents.includes("assert.throws(SyntaxError")) return [];
    let result = fn(true);
    return result ? [result] : [];
  } else if (data.flags.includes("noStrict") || test.location.includes("global/global-object.js")) {
    if (testFileContents.includes('"use strict";') && testFileContents.includes("assert.throws(SyntaxError")) return [];
    let result = fn(false);
    return result ? [result] : [];
  } else {
    // run both strict and non-strict
    let strictResult = fn(true);
    let unStrictResult = fn(false);
    let finalResult = [];
    if (strictResult) {
      finalResult.push(strictResult);
    }
    if (unStrictResult) {
      finalResult.push(unStrictResult);
    }
    return finalResult;
  }
}

/**
 * Parses the banners, and returns the banners as arbitrary object data if they
 * were found, or returns an error if the banner it couldn't be parsed.
 */
function getBanners(test: TestFileInfo, fileContents: string): ?BannerData {
  let banners = fileContents.match(/---[\s\S]+---/);
  let data = {};
  if (banners) {
    let bannerText = banners[0] || "";
    if (bannerText.includes("StrictMode")) {
      if (bannerText.includes("'arguments'")) return null;
      if (bannerText.includes("'caller'")) return null;
    } else if (bannerText.includes('properties "caller" or "arguments"')) {
      return null;
    } else if (bannerText.includes("function caller")) {
      return null;
    } else if (bannerText.includes("attribute of 'caller' property")) {
      return null;
    } else if (bannerText.includes("attribute of 'arguments'")) {
      return null;
    } else if (bannerText.includes("poisoned")) return null;
    try {
      data = yaml.safeLoad(banners[0].slice(3, -3));
    } catch (e) {
      // Some versions of test262 have comments inside of yaml banners.
      // parsing these will usually fail.
      return null;
    }
  }
  return BannerData.fromObject(data);
}
