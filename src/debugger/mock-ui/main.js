/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Session } from "./session.js";

function run(process, console) {
  let adapterPath: string = "";
  let prepackCommand: string = "";

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

  let session = new Session(process, adapterPath, prepackCommand);
  session.serve();
}
run(process, console);
