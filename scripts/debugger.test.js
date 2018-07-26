/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

// let child_process = require("child_process");
import { UISession } from "../lib/debugger/mock-ui/UISession.js";
import type { DebuggerCLIArguments } from "../lib/debugger/mock-ui/UISession.js";
import fs from "fs";

let expectedOutputsPrefix = ["Debugger is starting up Prepack...", "Prepack is ready"];
let expectedOutputsSuffix = ["Prepack exited! Shutting down..."];

function cleanDebuggerOutputs(outputs: Array<string>): Array<string> {
  return outputs.filter(o => !o.includes("dbg")).map(o => o.replace(/\r?\n|\r/g, ""));
}

function cleanExpectedOutputs(expected: Array<string>): Array<string> {
  return expectedOutputsPrefix.concat(expected).concat(expectedOutputsSuffix);
}

function generateArgs(prepackArguments: Array<string>, sourceFiles: Array<string>): DebuggerCLIArguments {
  return {
    adapterPath: "lib/debugger/adapter/DebugAdapter.js",
    prepackRuntime: "bin/prepack.js",
    sourceFiles: sourceFiles,
    prepackArguments: prepackArguments,
  };
}

function runTests(tests: Array<Array<string>>): void {
  describe.each(tests)("Debugger Correctness Tests", (name, prepackArgs, inputSourceFiles, commands, expected) => {
    test(name, done => {
      let args = generateArgs(prepackArgs, inputSourceFiles);
      let commandIndex = 0;
      let debuggerOutputs = [];

      let session = new UISession(process, args);

      let processResponse = function(data) {
        // console.log(`OUTPUT: ${data}`);
        debuggerOutputs.push(`${data}`);
      };

      // Allow UISession to query for next command so timing is correct.
      // It's much trickier to try and read outputs and send the correct command.
      let nextCommand = function(): string {
        if (commandIndex < commands.length) {
          let selectedCommand = commands[commandIndex];
          commandIndex += 1;
          // console.log(`SENDING: ${selectedCommand}`);
          return selectedCommand;
        }
        return "";
      };

      // Allow UISession to trigger the test when it finishes debugging.
      let runTest = function(): void {
        expect(cleanDebuggerOutputs(debuggerOutputs)).toEqual(cleanExpectedOutputs(expected));
        done();
      };

      session.serve(true, processResponse, nextCommand, runTest);
    });
  });
}

function findAndRunTests(): void {
  let testParams = [];
  let tests = JSON.parse(fs.readFileSync("test/debugger/testParams.json", "utf8")).DebuggerTestParameters;
  console.log(tests);
  for (let test of tests) {
    testParams.push([test.name, test.prepackArgs, test.sourceFiles, test.commands, test.expectedOutput]);
  }
  console.log(testParams);
  runTests(testParams);
}

findAndRunTests();
