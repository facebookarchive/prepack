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

import { prepackStdin, prepackFileSync, InitializationError } from "./prepack-node.js";
import { CompatibilityValues, type Compatibility } from './types.js';
import fs from "fs";

// Prepack helper
declare var __residual : any;

// Currently we need to explictly pass the captured variables we want to access.
// TODO: In a future version of this can be automatic.
function run(Object, Array, console, JSON, process, prepackStdin, prepackFileSync, InitializationError, CompatibilityValues, fs) {

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
  };

  while (args.length) {
    let arg = args[0]; args.shift();
    if (!arg.startsWith("--")) {
      inputFilename = arg;
    } else {
      arg = arg.slice(2);
      switch (arg) {
        case "out":
          arg = args[0]; args.shift();
          outputFilename = arg;
          break;
        case "compatibility":
          arg = args[0]; args.shift();
          if (!CompatibilityValues.includes(arg)) {
            console.error(`Unsupported compatibility: ${arg}`);
            process.exit(1);
          }
          compatibility = (arg: any);
          break;
        case "mathRandomSeed":
          mathRandomSeed = args[0]; args.shift();
          break;
        case "srcmapIn":
          inputSourceMap = args[0]; args.shift();
          break;
        case "srcmapOut":
          outputSourceMap = args[0]; args.shift();
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
    prepackStdin(resolvedOptions, function (serialized) {
      processSerializedCode(serialized);
    });
  } else {
    try {
      let serialized = prepackFileSync(
        inputFilename,
        resolvedOptions
      );
      processSerializedCode(serialized);
    } catch (x) {
      if (x instanceof InitializationError) {
        // Ignore InitializationError since they have already logged
        // their errors to the console, but exit with an error code.
        process.exit(1);
      }
      // For any other type of error, rethrow.
      throw x;
    }
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
  __residual('boolean', run, Object, Array, console, JSON, process, prepackStdin, prepackFileSync, InitializationError, CompatibilityValues, fs);
} else {
  run(Object, Array, console, JSON, process, prepackStdin, prepackFileSync, InitializationError, CompatibilityValues, fs);
}
