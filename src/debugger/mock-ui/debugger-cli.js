/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { UISession } from "./UISession.js";
import type { DebuggerCLIArguments } from "./UISession.js";
/* The entry point to start up the debugger CLI
 * Reads in command line arguments and starts up a UISession
*/

function run(process, console) {
  let args = readCLIArguments(process, console);
  let session = new UISession(process, args);
  try {
    session.serve();
  } catch (e) {
    console.error(e);
    session.shutdown();
  }
}

function readCLIArguments(process, console): DebuggerCLIArguments {
  let adapterPath = "";
  let prepackRuntime = "";
  let prepackArguments = [];
  let sourceFiles = [];

  let args = Array.from(process.argv);
  args.splice(0, 2);
  //read in the arguments
  while (args.length > 0) {
    let arg = args.shift();
    if (!arg.startsWith("--")) {
      console.error("Invalid argument: " + arg);
      process.exit(1);
    }
    arg = arg.slice(2); // Slice off the -- prefix
    if (arg === "adapterPath") {
      adapterPath = args.shift();
    } else if (arg === "prepackRuntime") {
      prepackRuntime = args.shift();
    } else if (arg === "prepackArguments") {
      prepackArguments = args.shift().split(" ");
    } else if (arg === "sourceFiles") {
      // Support multiple source files.
      // Assumes everything between --sourceFile and the next --[flag] is a source file.
      while (!arg.startsWith("--")) {
        sourceFiles.push(args.shift());
        if (args.length === 0) break;
        arg = args[0];
      }
    } else if (arg === "diagnosticSeverity") {
      arg = args.shift();
      if (arg !== "FatalError" && arg !== "RecoverableError" && arg !== "Warning" && arg !== "Information") {
        console.error("Invalid debugger diagnostic severity level");
      }
      prepackArguments = prepackArguments.concat(["--debugDiagnosticSeverity", `${arg}`]);
    } else {
      console.error("Unknown argument: " + arg);
      process.exit(1);
    }
  }

  if (adapterPath.length === 0) {
    console.error("No path to the debug adapter provided!");
    process.exit(1);
  }
  if (prepackRuntime.length === 0) {
    console.error("No Prepack runtime given to start Prepack");
    process.exit(1);
  }
  if (sourceFiles.length === 0) {
    console.error("No source code input file provided");
  }
  let result: DebuggerCLIArguments = {
    adapterPath: adapterPath,
    prepackRuntime: prepackRuntime,
    prepackArguments: prepackArguments,
    sourceFiles: sourceFiles,
  };
  return result;
}
run(process, console);
