/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

var child_process = require('child_process');

// function generateArgs(prepackArguments: Array<string>, sourceFiles: Array<string>): Array<string> {
//   return ["lib/debugger/mock-ui/debugger-cli.js", "--adapterPath", "lib/debugger/adapter/DebugAdapter.js", "--prepackRuntime", "bin/prepack.js", "--sourceFiles"].concat(sourceFiles);
// }

/*
test("trial1", () => {
  let args = generateArgs([], ["test/debugger/sample1.js"]);

  let child = child_process.execFile("node", args, (error, stdout, stderr) => {
    console.log(stdout);
    expect(stdout).toEqual("foobar");
  });

  const commands = ["run"];
  for (let command of commands) {
    child.stdin.write(`${command}\n`);
  }
  child.stdin.end();
});
*/

// let args = generateArgs([], ["test/debugger/sample1.js"]);

let args = ["lib/debugger/mock-ui/debugger-cli.js", "--adapterPath", "lib/debugger/adapter/DebugAdapter.js", "--prepackRuntime", "bin/prepack.js", "--sourceFiles", "test/debugger/sample1.js"];
const commands = ["breakpoint add /Users/davidcai/prepack/test/debugger/sample1.js 8", "run", "run"];
let commandIndex = 0;
let child = child_process.spawn("node", args);

child.stdout.on('data', function(data) {
  console.log(`OUTPUT: [${data}]`);
  if (data == "(dbg) (dbg) " || data == "(dbg) ") {
    if (commandIndex < commands.length) {
      console.log(`WRITING: [${commands[commandIndex]}]`)
      child.stdin.write(`${commands[commandIndex]}\n`);
      commandIndex += 1;
    }
  }
});
