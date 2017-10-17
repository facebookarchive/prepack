/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { UISession } from "./UISession.js";

/* The entry point to start up the debugger CLI
 * Reads in command line arguments and starts up a UISession
*/

function run(process, console) {
  let adapterPath = "";
  let prepackCommand = "";

  let args = Array.from(process.argv);
  args.splice(0, 2);
  //read in the arguments
  while (args.length > 0) {
    let arg = args.shift();
    if (!arg.startsWith("--")) {
      console.error("Invalid argument: " + arg);
      process.exit(1);
    }
    arg = arg.slice(2);
    if (arg === "adapterPath") {
      adapterPath = args.shift();
    } else if (arg === "prepack") {
      prepackCommand = args.shift();
    } else {
      console.error("Unknown argument: " + arg);
      process.exit(1);
    }
  }
  if (adapterPath.length === 0) {
    console.error("No path to the debug adapter provided!");
    process.exit(1);
  }
  if (prepackCommand.length === 0) {
    console.error("No command given to start Prepack");
    process.exit(1);
  }

  let session = new UISession(process, adapterPath, prepackCommand);
  try {
    session.serve();
  } catch (e) {
    console.error(e);
    session.shutdown();
  }

}
run(process, console);
