/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

let child_process = require("child_process");

let expectedOutputsPrefix = ["Debugger is starting up Prepack...", "Prepack is ready"];
let expectedOutputsSuffix = ["Prepack exited! Shutting down..."];

function generateArgs(prepackArguments: Array<string>, sourceFiles: Array<string>): Array<string> {
  let prepackArgs = [];
  for (let arg of prepackArguments) {
    prepackArgs.push("--prepackArguments");
    prepackArgs.push(arg);
  }
  return [
    "lib/debugger/mock-ui/debugger-cli.js",
    "--adapterPath",
    "lib/debugger/adapter/DebugAdapter.js",
    "--prepackRuntime",
    "bin/prepack.js",
    "--sourceFiles",
  ]
    .concat(sourceFiles)
    .concat(prepackArgs);
}

function cleanDebuggerOutputs(outputs: Array<string>): Array<string> {
  return outputs.filter(o => !o.includes("dbg")).map(o => o.replace(/\r?\n|\r/g, ""));
}

function prepareExpectedOutputs(expected: Array<string>): Array<string> {
  return expectedOutputsPrefix.concat(expected).concat(expectedOutputsSuffix);
}
let i;
for (i = 0; i < 3; i++) {
  test(`test${i}`, done => {
    let args = generateArgs([], ["test/debugger/sample1.js"]);
    const commands = ["breakpoint add test/debugger/sample1.js 8", "run", "run"];
    let commandIndex = 0;
    let expectedOutputs = prepareExpectedOutputs(["Breakpoint: test/debugger/sample1.js 8:2"]);
    let debuggerOutputs = [];

    let child = child_process.spawn("node", args);

    child.stdout.on("data", function(data) {
      // console.log(`OUTPUT: [${data}]`);
      let output = `${data}`;
      debuggerOutputs.push(output);
      if ((output === "(dbg) (dbg) " || output === "(dbg) ") && commandIndex < commands.length) {
        // console.log(`WRITING: [${commands[commandIndex]}]`);
        child.stdin.write(`${commands[commandIndex]}\n`);
        commandIndex += 1;
      } else if (output === "Prepack exited! Shutting down...\n") {
        child.kill("SIGINT");
      }
    });

    child.on("close", (code, signal) => {
      expect(cleanDebuggerOutputs(debuggerOutputs)).toEqual(expectedOutputs);
      done();
    });
  });
}
