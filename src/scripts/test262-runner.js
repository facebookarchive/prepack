/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { ThrowCompletion } from "../completions.js";
import { ObjectValue, StringValue } from "../values/index.js";
import { Realm, ExecutionContext } from "../realm.js";
import { DetachArrayBuffer } from "../methods/arraybuffer.js";
import { ToStringPartial } from "../methods/to.js";
import { Get } from "../methods/get.js";
import invariant from "../invariant.js";

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

const EOL = os.EOL;
const numCPUs = os.cpus().length;
require('source-map-support').install();

type HarnessMap = { [key: string]: string; };
type TestRecord = { test: TestFileInfo, result: TestResult[] };
type GroupsMap = { [key: string]: TestRecord[] };

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
      throw new Error(
        `Cannot be converted to a TestTask: ${JSON.stringify(obj)}`
      );
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
    if (
      "location" in obj && typeof obj.location === "string" &&
      "isES6" in obj && typeof obj.isES6 === "boolean"
    ) {
      return new TestFileInfo(obj.location, obj.isES6);
    } else {
      throw new Error(
        `Cannot be converted to a TestFileInfo: ${JSON.stringify(obj)}`
      );
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
      throw new Error(
        `Cannot be converted to a DoneMessage: ${JSON.stringify(obj)}`
      );
    }
    if (!("test" in obj && typeof obj.test === "object")) {
      throw new Error("A DoneMessage must have a test");
    }
    let msg = new DoneMessage(obj.test);
    if (
      "testResults" in obj &&
      typeof obj.testResults === "object" &&
      Array.isArray(obj.testResults)
    ) {
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
      throw new Error(
        `Cannot be converted to an ErrorMessage: ${JSON.stringify(obj)}`
      );
    }
    if (!("err" in obj && typeof obj.err === "object")) {
      throw new Error(
        `Cannot be converted to an ErrorMessage: ${JSON.stringify(obj)}`
      );
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

  constructor(
    passed: boolean,
    strict: boolean,
    err: ?Error = null,
  ) {
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
  description: string;
  flags: string[];
  features: string[];
  includes: string[];
  // eslint-disable-next-line flowtype/no-weak-types
  negative: Object;

  constructor() {
    this.info = "";
    this.es5id = "";
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

  constructor(
    verbose: boolean,
    timeout: number,
    bailAfter: number,
    cpuScale: number,
    statusFile: string,
    filterString: string,
    singleThreaded: boolean,
  ) {
    this.verbose = verbose;
    this.timeout = timeout;
    this.bailAfter = bailAfter;
    this.cpuScale = cpuScale;
    this.statusFile = statusFile;
    this.filterString = filterString;
    this.singleThreaded = singleThreaded;
  }
}

class WorkerProgramArgs {
  timeout: number;

  constructor(timeout: number) {
    this.timeout = timeout;
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

if (!('toJSON' in Error.prototype)) {
  // $FlowFixMe this needs to become defined for Error to be serialized
  Object.defineProperty(Error.prototype, 'toJSON', { // eslint-disable-line
    value: function () {
      let alt = {};
      Object.getOwnPropertyNames(this).forEach(function (key) {
        alt[key] = this[key];
      }, this);
      return alt;
    },
    configurable: true,
    writable: true
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
      console.log("Illegal argument: %s.\n%s", e.message, usage());
    } else {
      console.log(e);
    }
    return 1;
  }
  return 0;
}

function usage(): string {
  return `Usage: ${process.argv[0]} ${process.argv[1]} ` + EOL +
    `[--verbose] [--timeout <number>] [--bailAfter <number>] ` + EOL +
    `[--cpuScale <number>] [--statusFile <string>] [--singleThreaded]`;
}

function masterArgsParse(): MasterProgramArgs {
  let parsedArgs = minimist(process.argv.slice(2), {
    string: [
      "statusFile"
    ],
    boolean: [
      "verbose",
      "singleThreaded"
    ],
    default: {
      verbose: (process.stdout instanceof tty.WriteStream) ? false : true,
      statusFile: "",
      timeout: 10,
      cpuScale: 1,
      bailAfter: Infinity,
      singleThreaded: false
    }
  });
  let filterString = parsedArgs._[0];
  if (typeof parsedArgs.verbose !== "boolean") {
    throw new ArgsParseError("verbose must be a boolean (either --verbose or not)");
  }
  if (typeof parsedArgs.timeout !== "number") {
    throw new ArgsParseError("timeout must be a number (in seconds) (--timeout 10)");
  }
  if (typeof parsedArgs.bailAfter !== "number") {
    throw new ArgsParseError("bailAfter must be a number (--bailAfter 10)");
  }
  if (typeof parsedArgs.cpuScale !== "number") {
    throw new ArgsParseError("cpuScale must be a number (--cpuScale 0.5)");
  }
  if (typeof parsedArgs.statusFile !== "string") {
    throw new ArgsParseError("statusFile must be a string (--statusFile file.txt)");
  }
  if (typeof parsedArgs.singleThreaded !== "boolean") {
    throw new ArgsParseError("singleThreaded must be a boolean (either --singleThreaded or not)");
  }
  let programArgs = new MasterProgramArgs(
    parsedArgs.verbose,
    parsedArgs.timeout,
    parsedArgs.bailAfter,
    parsedArgs.cpuScale,
    parsedArgs.statusFile,
    filterString,
    parsedArgs.singleThreaded,
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
      timeout: 10,
    }
  });
  if (typeof parsedArgs.timeout !== "number") {
    throw new ArgsParseError("timeout must be a number (in seconds) (--timeout 10)");
  }
  return new WorkerProgramArgs(parsedArgs.timeout);
}

function masterRun(args: MasterProgramArgs) {
  let tests = getFilesSync(`${__dirname}/../../test/test262/test`);
  // remove tests that don't need to be ran
  const originalTestLength = tests.length;
  tests = tests.filter((test) => {
    return testFilterByMetadata(test, args.filterString);
  });
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
  numFiltered: number,
): void {
  console.log("Running the tests as a single process");
  // print out every 5 percent (more granularity than multi-process because multi-process
  // runs a lot faster)
  const granularity = Math.floor(tests.length / 20);
  let harnesses = getHarnesses();
  let numLeft = tests.length;
  for (let t of tests) {
    handleTest(t, harnesses, args.timeout, (err, results) => {
      numLeft--;
      if (numLeft === 0) {
        // all done
        process.exit(handleFinished(args, groups, numFiltered));
      }
      if (err) {
        if (args.verbose) {
          console.log(err);
        }
      } else {
        let ok = handleTestResults(groups, t, results);
        if (!ok) {
          // handleTestResults returns false if a failure threshold was
          // exceeded
          throw new Error("Too many test failures");
        }
        let progress = getProgressBar(numLeft, tests.length, granularity);
        if (progress) {
          console.log(progress);
        }
      }
    });
  }
}

function masterRunMultiProcess(
  args: MasterProgramArgs,
  groups: GroupsMap,
  tests: TestFileInfo[],
  numFiltered: number,
): void {
  if (!cluster.on) {
    // stop flow errors on "cluster.on"
    throw new Error("cluster is malformed");
  }
  const granularity = Math.floor(tests.length / 10);
  const originalTestLength = tests.length;
  // Fork workers.
  const numWorkers = Math.floor(numCPUs * args.cpuScale);
  console.log(`Master starting up, forking ${numWorkers} workers`);
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  let exitCount = 0;
  cluster.on('exit', (worker, code, signal) => {
    exitCount++;
    if (exitCount === numWorkers) {
      process.exit(handleFinished(args, groups, numFiltered));
    }
  });

  const giveTask = (worker) => {
    // grab another test to run and give it to the child process
    if (tests.length === 0) {
      worker.send(new QuitMessage());
    } else {
      worker.send(new TestTask(tests.pop()));
    }
  };

  cluster.on('message', (worker, message, handle) => {
    switch (message.type) {
      case ErrorMessage.sentinel:
        let errMsg = ErrorMessage.fromObject(message);
        // just skip the error, thus skipping that test
        if (args.verbose) {
          console.log(`An error occurred in worker #${worker.process.pid}:`);
          console.log(errMsg.err);
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
        throw new Error(
          `Master got an unexpected message: ${JSON.stringify(message)}`
        );
    }
  });

  cluster.on('online', (worker) => {
    giveTask(worker);
  });
}

function handleFinished(
  args: MasterProgramArgs,
  groups: GroupsMap,
  earlierNumSkipped: number,
): number {
  let numPassedES5 = 0;
  let numPassedES6 = 0;
  let numFailedES5 = 0;
  let numFailedES6 = 0;
  let numSkipped = earlierNumSkipped;
  let failed_groups = [];
  for (let group in groups) {
    // count some totals
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
      numSkipped += 2 - t.result.length;
      for (let testResult of t.result) {
        if (testResult.passed) {
          if (t.test.isES6) {
            group_es6_passed++;
          } else {
            group_es5_passed++;
          }
        } else {
          if (args.verbose) {
            errmsg += create_test_message(
              testName,
              testResult.passed,
              testResult.err,
              t.test.isES6,
              testResult.strict
            ) + EOL;
          }
          if (t.test.isES6) {
            group_es6_failed++;
          } else {
            group_es5_failed++;
          }
        }
      }
    }
    msg +=
      `Passed: ${group_es5_passed} / ${group_es5_passed + group_es5_failed} ` +
      `(${toPercentage(group_es5_passed, group_es5_passed + group_es5_failed)}%) ` +
      chalk.yellow("(es6)") + `: ${group_es6_passed} / ` +
      `${group_es6_passed + group_es6_failed} ` +
      `(${toPercentage(group_es6_passed, group_es6_passed + group_es6_failed)}%)`;
    if (args.verbose) {
      console.log(msg);
      if (errmsg) {
        console.log(errmsg);
      }
    } else if (group_es5_failed + group_es6_failed > 0) {
      failed_groups.push(msg);
    }
    numPassedES5 += group_es5_passed;
    numPassedES6 += group_es6_passed;
    numFailedES5 += group_es5_failed;
    numFailedES6 += group_es6_failed;
  }
  let status =
    `=== RESULTS ===` + EOL +
    `Passes: ${numPassedES5} / ${numPassedES5 + numFailedES5} ` +
    `(${toPercentage(numPassedES5, numPassedES5 + numFailedES5)}%)` + EOL +
    `ES6 passes: ${numPassedES6} / ${numPassedES6 + numFailedES6} ` +
    `(${toPercentage(numPassedES6, numPassedES6 + numFailedES6)}%)` + EOL +
    `Skipped: ${numSkipped}` + EOL;
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
  if (args.timeout === 10) numPassedES5 += 4;
  if (!args.filterString && (numPassedES5 < 22878 || numPassedES6 < 7703)) {
    console.log(chalk.red("Overall failure. Expected more tests to pass!"));
    return 1;
  } else {
    // use 0 to avoid the npm error messages
    return 0;
  }
}

function getProgressBar(
  currentTestLength: number,
  originalTestLength: number,
  granularity: number
): string {
  if (currentTestLength % granularity === 0 && currentTestLength !== 0) {
    // print out a percent of tests completed to keep the user informed
    return `Running... ${toPercentage(originalTestLength - currentTestLength, originalTestLength)}%`;
  } else {
    return "";
  }
}

// Returns false if test processing should stop.
function handleTestResults(groups: GroupsMap, test: TestFileInfo, testResults: TestResult[]): boolean {
  if (testResults.length !== 0) {
    // test results are in, add it to its corresponding group
    if (!(test.groupName in groups)) {
      groups[test.groupName] = [];
    }
    groups[test.groupName].push({ test: test, result: testResults });
  }
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

function create_test_message(
  name: string,
  success: boolean,
  err: ?Error,
  isES6: boolean,
  isStrict: boolean
): string {
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

function getHarnesses(): HarnessMap {
  let harnessesList = getFilesSync(`${__dirname}/../../test/test262/harness`);
  // convert to a mapping from harness name to file contents
  let harnesses: HarnessMap = {};
  for (let harness of harnessesList) {
    // sync is fine, it's an initialization stage and there's not that many
    // harnesses
    harnesses[path.basename(harness.location)] = fs.readFileSync(
      harness.location
    ).toString();
  }
  return harnesses;
}

function workerRun(args: WorkerProgramArgs) {
  // NOTE: all harnesses (including contents of harness files) need to be
  // used on workers. It needs to either be read from the fs once and
  // distributed via IPC or once from each process. This is the
  // "once from each process" approach.
  // get all the harnesses
  let harnesses = getHarnesses();
  // we're a worker, run a portion of the tests
  process.on('message', (message) => {
    switch (message.type) {
      case TestTask.sentinel:
        // begin executing this TestTask
        let task = TestTask.fromObject(message);
        handleTest(task.file, harnesses, args.timeout, (err, results) => {
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

function handleTestResultsMultiProcess(
  err: ?Error,
  test: TestFileInfo,
  testResults: TestResult[]
): void {
  if (err) {
    // $FlowFixMe flow says "process.send" could be undefined
    process.send(new ErrorMessage(err));
  } else {
    let msg = new DoneMessage(test);
    for (let t of testResults) {
      msg.testResults.push(t);
    }
    try {
      // $FlowFixMe flow says "process.send" could be undefined
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
      // $FlowFixMe flow says "process.send" could be undefined
      process.send(msg);
    }
  }
}

function handleTest(
  test: TestFileInfo,
  harnesses: HarnessMap,
  timeout: number,
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
      let keepThisTest = filterFeatures(banners) && filterFlags(banners) &&
        filterIncludes(banners) && filterDescription(banners);
      let testResults = [];
      if (keepThisTest) {
        // now run the test
        testResults = runTestWithStrictness(test, testFileContents, banners, harnesses, timeout);
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
function getFilesSync(
  filepath: string,
): TestFileInfo[] {
  let stat = fs.statSync(filepath);
  if (stat.isFile()) {
    return [new TestFileInfo(filepath, false)];
  } else if (stat.isDirectory()) {
    let subFiles = fs.readdirSync(filepath);
    return flatten(subFiles.map((f) => {
      return getFilesSync(path.join(filepath, f));
    }));
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
  let realm = new Realm({ timeout: timeout * 1000 });
  let executionContext = new ExecutionContext();
  executionContext.realm = realm;
  realm.pushContext(executionContext);

  // Create the Host-Defined functions.
  let $ = new ObjectValue(realm);

  $.defineNativeMethod("createRealm", 0, (context) => {
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

  realm.$GlobalObject.defineNativeProperty("$", $);
  realm.$GlobalObject.defineNativeMethod("print", 1, (context, [arg]) => { });

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
  timeout: number,
): ?TestResult {
  let { realm } = createRealm(timeout);

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
        (strict ? "\"use strict\";" + EOL : "") + testFileContents,
        test.location
      );
      if (completion instanceof ThrowCompletion) throw completion;
    } catch (err) {
      if (!data.negative || data.negative !== err.name) {
        throw err;
      }
    }

    if (data.negative.type) {
      throw new Error(
        "Was supposed to error with type " + data.negative.type + " but passed"
      );
    }

    // succeeded
    return new TestResult(true, strict);
  } catch (err) {
    switch (err.message) {
      case "Unsupported node type ArrayPattern":
      case "TODO: Patterns aren't supported yet":
      case "TODO: ClassDeclaration":
      case "TODO: ClassExpression":
      case "TODO: AwaitExpression":
      case "TODO: YieldExpression":
      case "Unknown node ArrayPattern":
      case "expected single name":
        return null;
      default:
        if (err.value && err.value.$Prototype &&
          err.value.$Prototype.intrinsicName === "SyntaxError.prototype") {
          return null;
        }
        break;
    }

    let stack = err.stack;
    if (data.negative.type) {
      let type = data.negative.type;
      if (err && err instanceof ThrowCompletion &&
        Get(realm, err.value, "name").value === type
      ) {
        // Expected an error and got one.
        return new TestResult(true, strict);
      } else {
        // Expected an error, but got something else.
        if (err && err instanceof ThrowCompletion) {
          return new TestResult(false, strict, err);
        } else {
          return new TestResult(false, strict, new Error(
            `Expected an error, but got something else: ${err.message}`
          ));
        }
      }
    } else {
      // Not expecting an error, but got one.
      try {
        if (err && err instanceof ThrowCompletion) {
          let interpreterStack: void | string;

          if (err.value instanceof ObjectValue) {
            if (err.value.$HasProperty("stack")) {
              interpreterStack = ToStringPartial(realm, Get(realm, err.value, "stack"));
            } else {
              interpreterStack = ToStringPartial(realm, Get(realm, err.value, "message"));
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

      return new TestResult(
        false,
        strict,
        new Error(
          `Got an error, but was not expecting one:${EOL}${stack}`
        )
      );
    }
  }
}

/**
 * Returns true if ${test} should be run, false otherwise
 */
function testFilterByMetadata(
  test: TestFileInfo,
  filterString: string,
): boolean {
  // filter hidden files
  if (path.basename(test.location)[0] === ".") return false;

  // emacs!
  if (test.location.includes("~")) return false;

  // command line filter
  // if the filter is specified, only include tests which match the string
  if (filterString && !test.location.includes(filterString)) return false;

  // SIMD isn't in JS yet
  if (test.location.includes("Simd")) return false;

  // temporarily disable intl402 tests (ES5)
  if (test.location.includes("intl402")) return false;

  // temporarily disable tests which use realm.
  if (test.location.includes("realm")) return false;

  // temporarily disable tests which use with. (??)
  if (test.location.includes("/with/")) return false;

  // disable tests which use Atomics
  if (test.location.includes("/Atomics/")) return false;

  // disable tests which use class
  if (test.location.includes("/class/")) return false;

  // disable tests which use modules
  if (test.location.includes("/module-code/")) return false;

  // disable browser specific tests
  if (test.location.includes("/annexB/")) return false;

  // disable tail-call optimization tests
  if (test.location.includes("tco")) return false;

  // disable nasty unicode tests.
  if (test.location.includes("U180") || test.location.includes("u180") || test.location.includes("mongolian")) return false;

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

function testFilterByContents(
  test: TestFileInfo,
  testFileContents: string
): boolean {
  // ES6 tests (can only be verified by contents, not by metadata)
  let is_es6 = testFileContents.includes(EOL + "es6id: ");
  test.isES6 = is_es6;

  // Ignore phase: early tests because those are errors that babel should catch
  // not issues related to Prepack
  let phase_early = testFileContents.indexOf("  phase: early");
  let end_of_comment = testFileContents.indexOf("---\*/");
  if (phase_early > 0 && phase_early < end_of_comment) return false;

  let esid_pending = testFileContents.indexOf("esid: pending");
  if (esid_pending > 0 && esid_pending < end_of_comment) return false;

  // disable tests that require parser to throw SyntaxError in strict Mode
  if (test.location.includes("/directive-prologue/") &&
    testFileContents.includes("assert.throws(SyntaxError,")) return false;

  // disable SharedArrayBuffer tests
  if (testFileContents.includes("SharedArrayBuffer")) return false;

  return true;
}

function filterFlags(data: BannerData): boolean {
  return !data.flags.includes("async");
}

function filterFeatures(data: BannerData): boolean {
  let features = data.features;
  if (features.includes("class")) return false;
  if (features.includes("default-parameters")) return false;
  if (features.includes("destructuring-binding")) return false;
  if (features.includes("generators")) return false;
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
  return !data.description.includes("Complex tests");
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
  timeout: number,
): Array<TestResult> {
  let fn = (strict: boolean) => {
    return runTest(
      test,
      testFileContents,
      data,
      harnesses,
      strict,
      timeout,
    );
  };
  if (data.flags.includes("onlyStrict")) {
    let result = fn(true);
    return result ? [result] : [];
  } else if (
    data.flags.includes("noStrict") ||
    test.location.includes("global/global-object.js")
  ) {
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
    return  finalResult;
  }
}

/**
 * Parses the banners, and returns the banners as arbitrary object data if they
 * were found, or returns an error if the banner it couldn't be parsed.
 */
function getBanners(
  test: TestFileInfo,
  fileContents: string
): ?BannerData {
  let banners = fileContents.match(/---[\s\S]+---/);
  let data = {};
  if (banners) {
    let bannerText = banners[0] || "";
    if (bannerText.includes("StrictMode")) {
      if (bannerText.includes("\'arguments\'")) return null;
      if (bannerText.includes("\'caller\'")) return null;
    } else if (bannerText.includes("properties \"caller\" or \"arguments\"")) {
      return null;
    } else if (bannerText.includes("function caller")) {
      return null;
    } else if (bannerText.includes("attribute of 'caller' property")) {
      return null;
    } else if (bannerText.includes("attribute of 'arguments'")) {
      return null;
    } else if (bannerText.includes("poisoned")) {
      return null;
    } else if (bannerText.includes("esid: sec-arguments-exotic-objects"))
      return null;
    data = yaml.safeLoad(banners[0].slice(3, -3));
  }
  return BannerData.fromObject(data);
}
