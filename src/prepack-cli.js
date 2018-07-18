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

import { CompilerDiagnostic, type ErrorHandlerResult, FatalError } from "./errors.js";
import {
  type Compatibility,
  CompatibilityValues,
  type ReactOutputTypes,
  ReactOutputValues,
  type InvariantModeTypes,
  InvariantModeValues,
} from "./options.js";
import { type SerializedResult } from "./serializer/types.js";
import { prepackStdin, prepackFileSync } from "./prepack-node.js";
import type { BabelNodeSourceLocation } from "@babel/types";
import fs from "fs";
import v8 from "v8";
import { version } from "../package.json";
import invariant from "./invariant";
import zipFactory from "node-zip";
import zipdir from "zip-dir";
import path from "path";
import JSONTokenizer from "./utils/JSONTokenizer.js";
import type { DebuggerConfigArguments, DebugReproArguments } from "./types";
import child_process from "child_process";

// Prepack helper
declare var __residual: any;

function run(
  Object,
  Array,
  console,
  JSON,
  process,
  prepackStdin,
  prepackFileSync,
  FatalError,
  CompatibilityValues,
  fs
) {
  let HELP_STR = `
    input                    The name of the file to run Prepack over (for web please provide the single js bundle file)
    --out                    The name of the output file
    --compatibility          The target environment for Prepack [${CompatibilityValues.map(v => `"${v}"`).join(", ")}]
    --mathRandomSeed         If you want Prepack to evaluate Math.random() calls, please provide a seed.
    --srcmapIn               The input sourcemap filename. If present, Prepack will output a sourcemap that maps from
                             the original file (pre-input sourcemap) to Prepack's output
    --srcmapOut              The output sourcemap filename.
    --maxStackDepth          Specify the maximum call stack depth.
    --timeout                The amount of time in seconds until Prepack should time out.
    --lazyObjectsRuntime     Enable lazy objects feature and specify the JS runtime that support this feature.
    --debugNames             Changes the output of Prepack so that for named functions and variables that get emitted into
                             Prepack's output, the original name is appended as a suffix to Prepack's generated identifier.
    --initializeMoreModules  Enable speculative initialization of modules (for the module system Prepack has builtin
                             knowledge about). Prepack will try to execute all factory functions it is able to.
    --trace                  Traces the order of module initialization.
    --serialize              Serializes the partially evaluated global environment as a program that recreates it.
                             (default = true)
    --check [start[, count]] Check residual functions for diagnostic messages. Do not serialize or produce residual code.
    --residual               Produces the residual program that results after constant folding.
    --profile                Collect statistics about time and memory usage of the different internal passes
    --logStatistics          Log statistics to console
    --statsFile              The name of the output file where statistics will be written to.
    --heapGraphFilePath      The name of the output file where heap graph will be written to.
    --inlineExpressions      When generating code, tells prepack to avoid naming expressions when they are only used once,
                             and instead inline them where they are used.
    --invariantLevel         0: no invariants (default); 1: checks for abstract values; 2: checks for accessed built-ins; 3: internal consistency
    --invariantMode          Whether to throw an exception or call a console function to log an invariant violation; default = throw.
    --emitConcreteModel      Synthesize concrete model values for abstract models(defined by __assumeDataProperty).
    --version                Output the version number.
    --reproOnFatal           Create a zip file with all information needed to reproduce a Prepack run if Prepacking fails with a FatalError.
    --reproUnconditionally   Create a zip file with all information needed to reproduce a Prepack run, regardless of success of Prepack.
    --cpuprofile             Create a CPU profile file for the run that can be loaded into the Chrome JavaScript CPU Profile viewer.
    --debugDiagnosticSeverity  FatalError | RecoverableError | Warning | Information (default = FatalError). Diagnostic level at which debugger will stop.
    --debugBuckRoot          Root directory that buck assumes when creating sourcemap paths.
  `;
  let args = Array.from(process.argv);
  args.splice(0, 2);
  let inputFilenames = [];
  let outputFilename;
  let check: void | Array<number>;
  let compatibility: Compatibility;
  let mathRandomSeed;
  let inputSourceMap;
  let outputSourceMap;
  let statsFileName;
  let maxStackDepth: number;
  let timeout: number;
  let debugIdentifiers: void | Array<string>;
  let lazyObjectsRuntime: string;
  let heapGraphFilePath: void | string;
  let debugInFilePath: string;
  let debugOutFilePath: string;
  let reactOutput: ReactOutputTypes = "create-element";
  let reproFilePath: void | string;
  let cpuprofilePath: void | string;
  let invariantMode: void | InvariantModeTypes;
  let invariantLevel: void | number;
  let reproUnconditionally = false;
  let reproOnFatal = false;
  let flags = {
    initializeMoreModules: false,
    trace: false,
    debugNames: false,
    emitConcreteModel: false,
    inlineExpressions: false,
    logStatistics: false,
    logModules: false,
    delayInitializations: false,
    delayUnsupportedRequires: false,
    accelerateUnsupportedRequires: true,
    internalDebug: false,
    debugScopes: false,
    serialize: false,
    residual: false,
    profile: false,
    instantRender: false,
    reactEnabled: false,
  };

  let reproArguments = [];
  let reproFileNames = [];
  let inputFile = fileName => {
    reproFileNames.push(fileName);
    return path.basename(fileName);
  };
  let debuggerConfigArgs: DebuggerConfigArguments = {};
  let debugReproArgs: void | DebugReproArguments;
  while (args.length) {
    let arg = args.shift();
    if (!arg.startsWith("--")) {
      let inputs = arg.trim().split(/\s+/g); // Split on all whitespace
      for (let input of inputs) {
        inputFilenames.push(input);
        reproFileNames.push(input);
      }
    } else {
      arg = arg.slice(2);
      switch (arg) {
        case "out":
          arg = args.shift();
          outputFilename = arg;
          // do not include this in reproArguments needed by --repro, as path is likely not portable between environments
          break;
        case "compatibility":
          arg = args.shift();
          if (!CompatibilityValues.includes(arg)) {
            console.error(`Unsupported compatibility: ${arg}`);
            process.exit(1);
          }
          compatibility = (arg: any);
          reproArguments.push("--compatibility", compatibility);
          break;
        case "mathRandomSeed":
          mathRandomSeed = args.shift();
          reproArguments.push("--mathRandomSeed", mathRandomSeed);
          break;
        case "srcmapIn":
          inputSourceMap = args.shift();
          reproArguments.push("--srcmapIn", inputFile(inputSourceMap));
          break;
        case "srcmapOut":
          outputSourceMap = args.shift();
          // do not include this in reproArguments needed by --repro, as path is likely not portable between environments
          break;
        case "statsFile":
          statsFileName = args.shift();
          // do not include this in reproArguments needed by --repro, as path is likely not portable between environments
          break;
        case "maxStackDepth":
          let value = args.shift();
          if (isNaN(value)) {
            console.error("Stack depth value must be a number");
            process.exit(1);
          }
          maxStackDepth = parseInt(value, 10);
          reproArguments.push("--maxStackDepth", maxStackDepth.toString());
          break;
        case "timeout":
          let seconds = args.shift();
          if (isNaN(seconds)) {
            console.error("Timeout must be a number");
            process.exit(1);
          }
          timeout = parseInt(seconds, 10) * 1000;
          reproArguments.push("--timeout", timeout.toString());
          break;
        case "debugIdentifiers":
          let debugIdentifiersString = args.shift();
          debugIdentifiers = debugIdentifiersString.split(",");
          reproArguments.push("--debugIdentifiers", debugIdentifiersString);
          break;
        case "check":
          let range = args.shift();
          if (range.startsWith("--")) {
            args.unshift(range);
            range = "0";
          }
          let pair: Array<any> = range.split(",");
          if (pair.length === 1) pair.push(Number.MAX_SAFE_INTEGER);
          let start = +pair[0];
          if (start < 0 || !Number.isInteger(start)) {
            console.error("check start offset must be a number");
            process.exit(1);
          }
          let count = +pair[1];
          if (count < 0 || !Number.isInteger(count)) {
            console.error("check count must be a number");
            process.exit(1);
          }
          check = [start, count];
          reproArguments.push("--check", range);
          break;
        case "debugInFilePath":
          debugInFilePath = args.shift();
          // do not include this in reproArguments needed by --repro, as debugger behavior is not currently supported for repros
          break;
        case "debugOutFilePath":
          debugOutFilePath = args.shift();
          // do not include this in reproArguments needed by --repro, as debugger behavior is not currently supported for repros
          break;
        case "lazyObjectsRuntime":
          lazyObjectsRuntime = args.shift();
          reproArguments.push("--lazyObjectsRuntime", lazyObjectsRuntime);
          break;
        case "heapGraphFilePath":
          heapGraphFilePath = args.shift();
          // do not include this in reproArguments needed by --repro, as path is likely not portable between environments
          break;
        case "reactOutput":
          arg = args.shift();
          if (!ReactOutputValues.includes(arg)) {
            console.error(`Unsupported reactOutput: ${arg}`);
            process.exit(1);
          }
          reactOutput = (arg: any);
          reproArguments.push("--reactOutput", reactOutput);
          break;
        case "reproOnFatal":
          reproOnFatal = true;
          reproFilePath = args.shift();
          debugReproArgs = {
            sourcemaps: [],
          };
          // do not include this in reproArguments needed by --repro, as we don't need to create a repro from the repro...
          break;
        case "reproUnconditionally":
          reproUnconditionally = true;
          reproFilePath = args.shift();
          debugReproArgs = {
            sourcemaps: [],
          };
          // do not include this in reproArguments needed by --repro, as we don't need to create a repro from the repro...
          break;
        case "cpuprofile":
          cpuprofilePath = args.shift();
          // do not include this in reproArguments needed by --repro, as path is likely not portable between environments
          break;
        case "invariantMode":
          arg = args.shift();
          if (!InvariantModeValues.includes(arg)) {
            console.error(`Unsupported invariantMode: ${arg}`);
            process.exit(1);
          }
          invariantMode = (arg: any);
          reproArguments.push("--invariantMode", invariantMode);
          break;
        case "invariantLevel":
          let invariantLevelString = args.shift();
          if (isNaN(invariantLevelString)) {
            console.error("invariantLevel must be a number");
            process.exit(1);
          }
          invariantLevel = parseInt(invariantLevelString, 10);
          reproArguments.push("--invariantLevel", invariantLevel.toString());
          break;
        case "debugDiagnosticSeverity":
          arg = args.shift();
          invariant(
            arg === "FatalError" || arg === "RecoverableError" || arg === "Warning" || arg === "Information",
            `Invalid debugger diagnostic severity: ${arg}`
          );
          debuggerConfigArgs.diagnosticSeverity = arg;
          reproArguments.push("--debugDiagnosticSeverity", arg);
          break;
        case "debugBuckRoot":
          let buckRoot = args.shift();
          debuggerConfigArgs.buckRoot = buckRoot;
          // Race condition with --repro flag
          if (debugReproArgs) debugReproArgs.buckRoot = buckRoot;
          reproArguments.push("--debugBuckRoot", "$(pwd)");
          break;
        case "help":
          const options = [
            "-- | input.js",
            "--out output.js",
            "--compatibility jsc",
            "--mathRandomSeed seedvalue",
            "--srcmapIn inputMap",
            "--srcmapOut outputMap",
            "--maxStackDepth depthValue",
            "--timeout seconds",
            "--debugIdentifiers id1,id2,...",
            "--check [start[, number]]",
            "--lazyObjectsRuntime lazyObjectsRuntimeName",
            "--heapGraphFilePath heapGraphFilePath",
            "--reactOutput " + ReactOutputValues.join(" | "),
            "--repro reprofile.zip",
            "--cpuprofile name.cpuprofile",
            "--invariantMode " + InvariantModeValues.join(" | "),
          ];
          for (let flag of Object.keys(flags)) options.push(`--${flag}`);

          console.log("Usage: prepack.js " + options.map(option => `[ ${option} ]`).join(" ") + "\n" + HELP_STR);
          return;
        case "version":
          console.log(version);
          return;
        default:
          if (arg in flags) {
            flags[arg] = true;
            reproArguments.push("--" + arg);
          } else {
            console.error(`Unknown option: ${arg}`);
            process.exit(1);
          }
      }
    }
  }

  if (!flags.serialize && !flags.residual) flags.serialize = true;
  if (check) {
    flags.serialize = false;
    flags.residual = false;
  }

  let resolvedOptions = Object.assign(
    {},
    {
      compatibility,
      mathRandomSeed,
      inputSourceMapFilename: inputSourceMap,
      errorHandler,
      sourceMaps: !!outputSourceMap,
      maxStackDepth,
      timeout,
      debugIdentifiers,
      check,
      lazyObjectsRuntime,
      debugInFilePath,
      debugOutFilePath,
      reactOutput,
      invariantMode,
      invariantLevel,
      debuggerConfigArgs,
      debugReproArgs,
    },
    flags
  );
  if (heapGraphFilePath !== undefined) resolvedOptions.heapGraphFormat = "DotLanguage";
  if (lazyObjectsRuntime !== undefined && (resolvedOptions.delayInitializations || resolvedOptions.inlineExpressions)) {
    console.error("lazy objects feature is incompatible with delayInitializations and inlineExpressions options");
    process.exit(1);
  }

  let compilerDiagnostics: Map<BabelNodeSourceLocation, CompilerDiagnostic> = new Map();
  let compilerDiagnosticsList: Array<CompilerDiagnostic> = [];
  function errorHandler(compilerDiagnostic: CompilerDiagnostic): ErrorHandlerResult {
    if (compilerDiagnostic.location) compilerDiagnostics.set(compilerDiagnostic.location, compilerDiagnostic);
    else compilerDiagnosticsList.push(compilerDiagnostic);
    return "Recover";
  }

  function printDiagnostics(caughtFatalError: boolean): boolean {
    if (compilerDiagnostics.size === 0 && compilerDiagnosticsList.length === 0) {
      // FatalErrors must have generated at least one CompilerDiagnostic.
      invariant(!caughtFatalError, "FatalError must generate at least one CompilerDiagnostic");
      return true;
    }

    let informations = 0;
    let warnings = 0;
    let recoverableErrors = 0;
    let fatalErrors = 0;
    let printCompilerDiagnostic = (
      compilerDiagnostic: CompilerDiagnostic,
      locString?: string = "At an unknown location"
    ) => {
      switch (compilerDiagnostic.severity) {
        case "Information":
          informations++;
          break;
        case "Warning":
          warnings++;
          break;
        case "RecoverableError":
          recoverableErrors++;
          break;
        default:
          invariant(compilerDiagnostic.severity === "FatalError");
          fatalErrors++;
          break;
      }
      console.error(
        `${locString} ${compilerDiagnostic.severity} ${compilerDiagnostic.errorCode}: ${compilerDiagnostic.message}` +
          ` (https://github.com/facebook/prepack/wiki/${compilerDiagnostic.errorCode})`
      );
      let callStack = compilerDiagnostic.callStack;
      if (callStack !== undefined) {
        let eolPos = callStack.indexOf("\n");
        if (eolPos > 0) console.error(callStack.substring(eolPos + 1));
      }
    };
    for (let [loc, compilerDiagnostic] of compilerDiagnostics) {
      let sourceMessage = "";
      switch (loc.source) {
        case null:
        case "":
          sourceMessage = "In an unknown source file";
          break;
        case "no-filename-specified":
          sourceMessage = "In stdin";
          break;
        default:
          invariant(loc !== null && loc.source !== null);
          sourceMessage = `In input file ${loc.source}`;
          break;
      }

      let locString = `${sourceMessage}(${loc.start.line}:${loc.start.column + 1})`;
      printCompilerDiagnostic(compilerDiagnostic, locString);
    }
    for (let compilerDiagnostic of compilerDiagnosticsList) printCompilerDiagnostic(compilerDiagnostic);
    invariant(informations + warnings + recoverableErrors + fatalErrors > 0);
    let plural = (count, word) => (count === 1 ? word : `${word}s`);
    console.error(
      `Prepack ${fatalErrors > 0 ? "failed" : "succeeded"}, reporting ${[
        fatalErrors > 0 ? `${fatalErrors} ${plural(fatalErrors, "fatal error")}` : undefined,
        recoverableErrors > 0 ? `${recoverableErrors} ${plural(recoverableErrors, "recoverable error")}` : undefined,
        warnings > 0 ? `${warnings} ${plural(warnings, "warning")}` : undefined,
        informations > 0 ? `${informations} ${plural(informations, "informational message")}` : undefined,
      ]
        .filter(s => s !== undefined)
        .join(", ")}.`
    );

    return fatalErrors === 0;
  }

  function generateDebugRepro(
    sourceMaps: Array<string>,
    originalSourceFiles: Array<{ absolute: string, relative: string }>
  ) {
    if (reproFilePath === undefined) return;

    let reproZip = zipFactory();
    // Copy all original sourcefiles used while Prepacking.
    for (let file of originalSourceFiles) {
      try {
        // To avoid copying the "/User/name/..." version of the bundle/map/model included in originalSourceFiles
        if (!reproFileNames.includes(file.relative)) {
          console.log(`Zipping ${file.absolute}`);
          let content = fs.readFileSync(file.absolute, "utf8");
          reproZip.file(file.relative, content);
        }
      } catch (err) {
        console.error(`Could not zip source file: ${err}`);
      }
    }

    // Copy all input files
    for (let file of reproFileNames) {
      let content = fs.readFileSync(file, "utf8");
      reproZip.file(path.basename(file), content);
    }

    // Copy all sourcemaps (discovered while prepacking)
    for (let map of sourceMaps) {
      try {
        console.log(`Zipping ${map}`);
        let content = fs.readFileSync(map, "utf8");
        reproZip.file(path.basename(map), content);
      } catch (err) {
        console.error(`Could not zip sourcemap: ${err}`);
      }
    }

    // Copy Prepack lib and package.json to install dependencies.
    let yarnRuntime = "yarn";
    let yarnCommand = ["pack", "--filename", "prepack-bundled.tgz"];
    let yarnProcess = child_process.spawn(yarnRuntime, yarnCommand);

    yarnProcess.on("exit", function(code, signal) {
      // Because zipping the .tgz causes corruption issues when unzipping, we will
      // unpack the .tgz, then zip those contents. The `yarn pack` command is so that
      // all necessary files are found automatically.
      let unzipRuntime = "tar";
      let unzipCommand = ["-xzf", "prepack-bundled.tgz"];
      let unzipProcess = child_process.spawn(unzipRuntime, unzipCommand);

      unzipProcess.on("exit", function(code, signal) {
        zipdir(path.resolve(path.dirname(__dirname), "package"), function(err, buffer) {
          if (err) {
            console.error(err);
            return;
          }

          reproZip.file("prepack-runtime-bundle.zip", buffer);

          // Programatically assemble parameters to debugger.
          let reproScriptArguments = `prepackArguments=${reproArguments.map(a => `${a}`).join("&prepackArguments=")}`;
          let reproScriptSourceFiles = `sourceFiles=$(pwd)/${reproFileNames
            .map(f => `${path.basename(f)}`)
            .join("&sourceFiles=$(pwd)/")}`;

          reproZip.file(
            "repro.sh",
            `#!/bin/bash
        unzip prepack-runtime-bundle.zip
        yarn install
        PREPACK_RUNTIME="prepackRuntime=$(pwd)/lib/prepack-cli.js"
        PREPACK_ARGUMENTS="${reproScriptArguments}"
        PREPACK_SOURCEFILES="${reproScriptSourceFiles}"
        atom \"atom://nuclide/prepack-debugger?$PREPACK_SOURCEFILES&$PREPACK_RUNTIME&$PREPACK_ARGUMENTS\"
        `
          );
          const data = reproZip.generate({ base64: false, compression: "DEFLATE" });
          if (reproFilePath) fs.writeFileSync(reproFilePath, data, "binary");
        });
      });
    });
  }

  let profiler;
  let success;
  try {
    if (cpuprofilePath !== undefined) {
      try {
        profiler = require("v8-profiler");
      } catch (e) {
        // Profiler optional dependency failed
        console.error("v8-profiler doesn't work correctly on Windows, see issue #1695");
        throw e;
      }
      profiler.setSamplingInterval(100); // default is 1000us
      profiler.startProfiling("");
    }

    try {
      if (inputFilenames.length === 0) {
        prepackStdin(resolvedOptions, processSerializedCode, printDiagnostics);
        return;
      }
      let serialized = prepackFileSync(inputFilenames, resolvedOptions);
      if (reproUnconditionally) {
        if (serialized.sourceFilePaths) {
          generateDebugRepro(serialized.sourceFilePaths.sourceMaps, serialized.sourceFilePaths.sourceFiles);
        } else {
          generateDebugRepro([], []);
        }
      }

      success = printDiagnostics(false);
      if (resolvedOptions.serialize && serialized) processSerializedCode(serialized);
    } catch (err) {
      printDiagnostics(err instanceof FatalError);
      if (!(err instanceof FatalError)) {
        // if it is not a FatalError, it means prepack failed, and we should display the Prepack stack trace.
        console.error(err.stack);
      }
      if (reproOnFatal || reproUnconditionally) {
        // Get largest list of original sources from all diagnostics.
        // Must iterate through both because maps are ordered so we can't tell which diagnostic is most recent.
        let largestSourceFilesList = [];
        let largestLength = 0;
        let sourceMaps = [];

        let allDiagnostics = Array.from(compilerDiagnostics.values()).concat(compilerDiagnosticsList);
        allDiagnostics.forEach(diagnostic => {
          if (
            diagnostic.sourceFilePaths &&
            diagnostic.sourceFilePaths.sourceFiles &&
            diagnostic.sourceFilePaths.sourceMaps
          ) {
            if (diagnostic.sourceFilePaths.sourceFiles.length > largestLength) {
              largestSourceFilesList = diagnostic.sourceFilePaths.sourceFiles;
              largestLength = diagnostic.sourceFilePaths.sourceFiles.length;
              sourceMaps = diagnostic.sourceFilePaths.sourceMaps;
            }
          }
        });
        generateDebugRepro(sourceMaps, largestSourceFilesList);
        return;
      }
      success = false;
    }
  } finally {
    if (profiler !== undefined) {
      let data = profiler.stopProfiling("");
      let start = Date.now();
      invariant(cpuprofilePath !== undefined);
      let stream = fs.createWriteStream(cpuprofilePath);
      let getNextToken = JSONTokenizer(data);
      let write = () => {
        for (let token = getNextToken(); token !== undefined; token = getNextToken()) {
          if (!stream.write(token)) {
            stream.once("drain", write);
            return;
          }
        }
        stream.end();
        invariant(cpuprofilePath !== undefined);
        console.log(`Wrote ${cpuprofilePath} in ${Date.now() - start}ms`);
      };
      write();
    }
  }

  function processSerializedCode(serialized: SerializedResult) {
    if (serialized.code === "") {
      console.error("Prepack returned empty code.");
      return;
    }
    if (outputFilename) {
      console.log(`Prepacked source code written to ${outputFilename}.`);
      fs.writeFileSync(outputFilename, serialized.code);
    } else {
      console.log(serialized.code);
    }
    if (statsFileName) {
      let statistics = serialized.statistics;
      if (statistics === undefined) {
        return;
      }
      let stats = {
        RealmStatistics: statistics.getRealmStatistics(),
        SerializerStatistics: statistics.getSerializerStatistics(),
        TimingStatistics: statistics.projectPerformanceTrackers("Time", pt => pt.time),
        HeapStatistics: statistics.projectPerformanceTrackers("Memory", pt => pt.memory),
        MemoryStatistics: v8.getHeapStatistics(),
      };
      fs.writeFileSync(statsFileName, JSON.stringify(stats));
    }
    if (outputSourceMap) {
      fs.writeFileSync(outputSourceMap, serialized.map ? JSON.stringify(serialized.map) : "");
    }
    if (heapGraphFilePath !== undefined) {
      invariant(serialized.heapGraph);
      fs.writeFileSync(heapGraphFilePath, serialized.heapGraph);
    }
  }

  if (!success) process.exit(1);
}

if (typeof __residual === "function") {
  // If we're running inside of Prepack. This is the residual function we'll
  // want to leave untouched in the final program.
  __residual(
    "boolean",
    run,
    Object,
    Array,
    console,
    JSON,
    process,
    prepackStdin,
    prepackFileSync,
    FatalError,
    CompatibilityValues,
    fs
  );
} else {
  run(Object, Array, console, JSON, process, prepackStdin, prepackFileSync, FatalError, CompatibilityValues, fs);
}
