/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { run } from "./prepack.js";

let args = Array.from(process.argv);
args.splice(0, 2);
let inputFilename;
let outputFilename;
let compatibility;
let mathRandomSeed;
let inputMap;
let ouputMap;
let speculate = false;
let trace = false;
while (args.length) {
  let arg = args[0]; args.shift();
  if (arg === "--out") {
    arg = args[0]; args.shift();
    outputFilename = arg;
  } else if (arg === "--compatibility") {
    arg = args[0]; args.shift();
    if (arg !== "jsc") {
      console.error(`Unsupported compatibility: ${arg}`);
      process.exit(1);
    } else {
      compatibility = arg;
    }
  } else if (arg === "--mathRandomSeed") {
    mathRandomSeed = args[0]; args.shift();
  } else if (arg === "--srcmapIn") {
    inputMap = args[0]; args.shift();
  } else if (arg === "--srcmapOut") {
    ouputMap = args[0]; args.shift();
  } else if (arg === "--speculate") {
    speculate = true;
  } else if (arg === "--trace") {
    trace = true;
  } else if (arg === "--help") {
    console.log("Usage: prepack.js [ --out output.js ] [ --compatibility jsc ] [ --mathRandomSeed seedvalue ] [ --srcmapIn inputMap ] [ --srcmapOut outputMap ] [ --speculate ] [ --trace ] [ -- | input.js ]");
  } else if (!arg.startsWith("--")) {
    inputFilename = arg;
  } else {
    console.error(`Unknown option: ${arg}`);
    process.exit(1);
  }
}
if (!inputFilename) {
  console.error("Missing input file.");
  process.exit(1);
} else {
  run(inputFilename, compatibility, mathRandomSeed, outputFilename, inputMap, ouputMap, speculate, trace);
}
