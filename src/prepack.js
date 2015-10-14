/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import Serialiser from "./serialiser.js";
import invariant from "./invariant.js";

let fs        = require("fs");

function run_internal(name: string, raw: string, map: string = "", compatibility?: "browser" | "jsc" = "browser", mathRandomSeed: void | string, outputFilename?: string, outputMap?: string) {
  let serialised = new Serialiser({ partial: true, compatibility, mathRandomSeed }).init(name, raw, map, outputMap !== undefined);
  if (!serialised) {
    process.exit(1);
    invariant(false);
  }
  let code = serialised.code;

  if (code.length >= 1000 || outputFilename) {
    let filename = outputFilename || (name + "-processed.js");
    console.log(`Prepacked source code written to ${filename}.`);
    if (compatibility === "jsc") {
      code = "var global = this;\n" + code;
    }
    fs.writeFileSync(filename, code);
  }

  if (code.length <= 1000 && !outputFilename) {
    console.log("+++++++++++++++++ Prepacked source code");
    console.log(code);
    console.log("=================");
  }

  if (outputMap) {
    fs.writeFileSync(outputMap, map);
  }
}

let args = Array.from(process.argv);
args.splice(0, 2);
let inputFilename;
let outputFilename;
let compatibility;
let mathRandomSeed;
let inputMap;
let ouputMap;
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
  } else if (arg === "--help") {
    console.log("Usage: prepack.js [ --out output.js ] [ --compatibility jsc ] [ --mathRandomSeed seedvalue ] [ --srcmapIn inputMap ] [ --srcmapOut outputMap ] [ -- | input.js ]");
  } else if (!arg.startsWith("--")) {
    inputFilename = arg;
  } else {
    console.error(`Unknown option: ${arg}`);
    process.exit(1);
  }
}

export function run(inFn: string, compat?: "browser" | "jsc" = "browser", mathRandSeed: void | string, outFn?: string, outMap?: string) {
  let input = fs.readFileSync(inFn, "utf8");
  let map = "";
  let mapFile = inputMap ? inputMap : inFn + ".map";
  try {
    map = fs.readFileSync(mapFile, "utf8");
  } catch (_e) {
    console.log(`No sourcemap found at ${mapFile}.`);
  }
  run_internal(inFn, input, map, compat, mathRandSeed, outFn, outMap);
}

if (!inputFilename) {
  console.error("Missing input file.");
  process.exit(1);
} else {
  run(inputFilename, compatibility, mathRandomSeed, outputFilename, ouputMap);
}
