/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

/* eslint-disable no-shadow */

import { FatalError } from "./errors.js";
import { prepackStdin, prepackFileSync } from "./prepack-node.js";
import { CompatibilityValues, type Compatibility } from './types.js';
import fs from "fs";

// Prepack helper
declare var __residual : any;

// Currently we need to explictly pass the captured variables we want to access.
// TODO: In a future version of this can be automatic.
function run(Object, Array, console, JSON, process, prepackStdin, prepackFileSync, FatalError, CompatibilityValues, fs) {

  let HELP_STR = `
    input    The name of the file to run Prepack over (for web please provide the single js bundle file)
    --out    The name of the output file
    --compatibility    The target environment for Prepack [${CompatibilityValues.map(v => `"${v}"`).join(', ')}]
    --mathRandomSeed    If you want Prepack to evaluate Math.random() calls, please provide a seed.
    --srcmapIn    The input sourcemap filename. If present, Prepack will output a sourcemap that maps from the original file (pre-input sourcemap) to Prepack's output
    --srcmapOut    The output sourcemap filename.
    --debugNames    Changes the output of Prepack so that for named functions and variables that get emitted into Prepack's output, the original name is appended as a suffix to Prepack's generated identifier.
    --singlePass    Perform only one serialization pass. Disables some optimizations on Prepack's output. This will speed up Prepacking but result in code with less inlining.
    --speculate    Enable speculative initialization of modules (for the module system Prepack has builtin knowledge about). Prepack will try to execute all factory functions it is able to.
    --trace    Traces the order of module initialization.
    --serialize    Serializes the partially evaluated global environment as a program that recreates it. (default = true)
    --residual    Produces the residual program that results after constant folding.
    --profile    Enables console logging of profile information of different phases of prepack.
  `;
  let args = Array.from(process.argv);
  args.splice(0, 2);
  let inputFilename;
  let outputFilename;
  let compatibility: Compatibility;
  let mathRandomSeed;
  let inputSourceMap;
  let outputSourceMap;
  let flags = {
    speculate: false,
    trace: false,
    debugNames: false,
    singlePass: false,
    logStatistics: false,
    logModules: false,
    delayUnsupportedRequires: false,
    internalDebug: false,
    serialize: false,
    residual: false,
    profile: false,
  };

  while (args.length) {
    let arg = args.shift();
    if (!arg.startsWith("--")) {
      inputFilename = arg;
    } else {
      arg = arg.slice(2);
      switch (arg) {
        case "out":
          arg = args.shift();
          outputFilename = arg;
          break;
        case "compatibility":
          arg = args.shift();
          if (!CompatibilityValues.includes(arg)) {
            console.error(`Unsupported compatibility: ${arg}`);
            process.exit(1);
          }
          compatibility = (arg: any);
          break;
        case "mathRandomSeed":
          mathRandomSeed = args.shift();
          break;
        case "srcmapIn":
          inputSourceMap = args.shift();
          break;
        case "srcmapOut":
          outputSourceMap = args.shift();
          break;
        case "help":
          console.log("Usage: prepack.js [ --out output.js ] [ --compatibility jsc ] [ --mathRandomSeed seedvalue ] [ --srcmapIn inputMap ] [ --srcmapOut outputMap ] [ --speculate ] [ --trace ] [ -- | input.js ] [ --singlePass ] [ --debugNames ]" + "\n" + HELP_STR);
          break;
        default:
          if (arg in flags) {
            flags[arg] = true;
          } else {
            console.error(`Unknown option: ${arg}`);
            process.exit(1);
          }
      }
    }
  }
  if (!flags.serialize && !flags.residual)
    flags.serialize = true;

  let resolvedOptions = Object.assign(
    {},
    {
      compatibility,
      mathRandomSeed,
      inputSourceMapFilename: inputSourceMap,
      sourceMaps: !!outputSourceMap,
    },
    flags
  );

  if (!inputFilename) {
    prepackStdin(resolvedOptions, processSerializedCode);
    return;
  }
  try {
    let serialized = prepackFileSync(
      inputFilename,
      resolvedOptions
    );
    processSerializedCode(serialized);
  } catch (x) {
    if (x instanceof FatalError) {
      // Ignore FatalError since an error has already logged
      // their errors to the console, but exit with an error code.
      process.exit(1);
    }
    console.log(x.message);
    console.log(x.stack);
  }

  function processSerializedCode(serialized) {
    if (outputFilename) {
      console.log(`Prepacked source code written to ${outputFilename}.`);
      fs.writeFileSync(outputFilename, serialized.code);
    } else {
      console.log(serialized.code);
    }
    if (outputSourceMap) {
      fs.writeFileSync(outputSourceMap, serialized.map ? JSON.stringify(serialized.map) : '');
    }
  }

  return true;
}

if (typeof __residual === 'function') {
  // If we're running inside of Prepack. This is the residual function we'll
  // want to leave untouched in the final program.
  __residual('boolean', run, Object, Array, console, JSON, process, prepackStdin, prepackFileSync, FatalError, CompatibilityValues, fs);
} else {
  run(Object, Array, console, JSON, process, prepackStdin, prepackFileSync, FatalError, CompatibilityValues, fs);
}
