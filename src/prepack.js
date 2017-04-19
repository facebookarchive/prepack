/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */
import Serializer from "./serializer/index.js";
import invariant from "./invariant.js";
let fs        = require("fs");

function run_internal(
    name: string,
    raw: string,
    map: string = "",
    compatibility?: "browser" | "jsc-600-1-4-17" = "browser",
    mathRandomSeed: void | string,
    outputFilename?: string,
    outputMap?: string,
    speculate: boolean = false,
    trace: boolean = false,
    debugNames: boolean = false,
    singlePass: boolean = false,
    logStatistics: boolean = false,
    logModules: boolean = false,
    delayUnsupportedRequires: boolean = false) {
  let serialized =
    new Serializer(
      { partial: true, compatibility, mathRandomSeed },
      { initializeMoreModules: speculate, internalDebug: true, trace, debugNames, singlePass, logStatistics, logModules, delayUnsupportedRequires })
        .init(name, raw, map, outputMap !== undefined);
  if (!serialized) {
    process.exit(1);
    invariant(false);
  }
  let code = serialized.code;

  if (code.length >= 1000 || outputFilename) {
    let filename = outputFilename || (name + "-processed.js");
    console.log(`Prepacked source code written to ${filename}.`);
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

export function run(
    inFn: string,
    compat?: "browser" | "jsc-600-1-4-17" = "browser",
    mathRandSeed: void | string,
    outFn?: string,
    inputMap?: string,
    outMap?: string,
    speculateOpt?: boolean,
    trace?: boolean,
    debugNames?: boolean,
    singlePass?: boolean,
    logStatistics?: boolean,
    logModules?: boolean,
    delayUnsupportedRequires?: boolean) {
  let input = fs.readFileSync(inFn, "utf8");
  let map = "";
  let mapFile = inputMap ? inputMap : inFn + ".map";
  try {
    map = fs.readFileSync(mapFile, "utf8");
  } catch (_e) {
    console.log(`No sourcemap found at ${mapFile}.`);
  }
  run_internal(inFn, input, map, compat, mathRandSeed, outFn, outMap, speculateOpt, trace, debugNames, singlePass, logStatistics, logModules, delayUnsupportedRequires);
}
