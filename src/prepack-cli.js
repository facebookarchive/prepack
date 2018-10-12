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
  DiagnosticSeverityValues,
} from "./options.js";
import { type SerializedResult } from "./serializer/types.js";
import { TextPrinter } from "./utils/TextPrinter.js";
import { prepackStdin, prepackFileSync } from "./prepack-node.js";
import type { BabelNodeSourceLocation } from "@babel/types";
import fs from "fs";
import v8 from "v8";
import { version } from "../package.json";
import invariant from "./invariant";
import JSONTokenizer from "./utils/JSONTokenizer.js";
import type { DebuggerConfigArguments, DebugReproArguments } from "./types";
import { DebugReproPackager } from "./utils/DebugReproPackager.js";

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
    --modulesToInitialize [ALL | comma separated list | filepath to JSON array of value]
                             Enable speculative initialization of modules (for the module system Prepack has builtin
                             knowledge about). Prepack will try to execute the factory functions of the modules you specify.
    --trace                  Traces the order of module initialization.
    --check [start[, count]] Check residual functions for diagnostic messages. Do not generate code.
    --profile                Collect statistics about time and memory usage of the different internal passes
    --logStatistics          Log statistics to console
    --statsFile              The name of the output file where statistics will be written to.
    --heapGraphFilePath      The name of the output file where heap graph will be written to.
    --dumpIRFilePath         The name of the output file where the intermediate representation will be written to.
    --removeModuleFactoryFunctions         Forces optimized module factory functions to be removed, even if they are reachable.
    --inlineExpressions      When generating code, tells prepack to avoid naming expressions when they are only used once,
                             and instead inline them where they are used.
    --invariantLevel         0: no invariants (default); 1: checks for abstract values; 2: checks for accessed built-ins; 3: internal consistency
    --invariantMode          Whether to throw an exception or call a console function to log an invariant violation; default = throw.
    --emitConcreteModel      Synthesize concrete model values for abstract models(defined by __assumeDataProperty).
    --version                Output the version number.
    --reproOnFatalError      Create a zip file with all information needed to reproduce a Prepack run if Prepacking fails with a FatalError.
    --reproUnconditionally   Create a zip file with all information needed to reproduce a Prepack run, regardless of success of Prepack.
    --cpuprofile             Create a CPU profile file for the run that can be loaded into the Chrome JavaScript CPU Profile viewer.
    --debugDiagnosticSeverity  FatalError | RecoverableError | Warning | Information (default = FatalError). Diagnostic level at which debugger will stop.
    --debugBuckRoot          Root directory that buck assumes when creating sourcemap paths.
    --warnAsError            Turns all warnings into errors.
    --diagnosticAsError      A comma-separated list of non-fatal-error PPxxxx diagnostic codes that should get turned into (recoverable) errors.
    --noDiagnostic           A comma-separated list of non-fatal-error PPxxxx diagnostic codes that should get suppressed.
  `;
  let args = Array.from(process.argv);
  args.splice(0, 2);
  let inputFilenames = [];
  let outputFilename;
  let check: void | Array<number>;
  let compatibility: Compatibility;
  let mathRandomSeed;
  let inputSourceMapFilenames = [];
  let outputSourceMap;
  let statsFileName;
  let maxStackDepth: number;
  let timeout: number;
  let debugIdentifiers: void | Array<string>;
  let lazyObjectsRuntime: string;
  let heapGraphFilePath: void | string;
  let dumpIRFilePath: void | string;
  let debugInFilePath: string;
  let debugOutFilePath: string;
  let reactOutput: ReactOutputTypes = "create-element";
  let reproFilePath: void | string;
  let cpuprofilePath: void | string;
  let invariantMode: void | InvariantModeTypes;
  let invariantLevel: void | number;
  let reproMode: void | "reproUnconditionally" | "reproOnFatalError";
  let debugReproPackager: void | DebugReproPackager;
  // Indicates where to find a zip with prepack runtime. Used in environments where
  // the `yarn pack` strategy doesn't work.
  let externalPrepackPath: void | string;
  let diagnosticAsError: void | Set<string>;
  let noDiagnostic: void | Set<string>;
  let warnAsError: void | true;
  let modulesToInitialize: void | Set<string | number> | "ALL";
  let flags = {
    trace: false,
    debugNames: false,
    emitConcreteModel: false,
    inlineExpressions: false,
    removeModuleFactoryFunctions: false,
    logStatistics: false,
    logModules: false,
    delayInitializations: false,
    internalDebug: false,
    debugScopes: false,
    profile: false,
    instantRender: false,
    reactEnabled: false,
  };
  let reproArguments = [];
  let reproFileNames = [];
  let debuggerConfigArgs: DebuggerConfigArguments = {};
  let debugReproArgs: void | DebugReproArguments;
  while (args.length) {
    let arg = args.shift();
    if (!arg.startsWith("--")) {
      let inputs = arg.trim().split(/\s+/g); // Split on all whitespace
      for (let input of inputs) {
        inputFilenames.push(input);
        if (!input.includes(".map")) reproFileNames.push(input);
        // Don't include sourcemaps in reproFiles because they will be captured later on in prepack-node
      }
    } else {
      arg = arg.slice(2);
      switch (arg) {
        case "modulesToInitialize":
          let modulesString = args.shift().trim();
          if (fs.existsSync(modulesString))
            try {
              let modulesFileContents = fs.readFileSync(modulesString, "utf-8");
              modulesToInitialize = new Set(JSON.parse(modulesFileContents));
            } catch (e) {
              console.error(`Tried reading ${modulesString} as a file, but failed: ${e.message}`);
            }
          else modulesToInitialize = modulesString === "ALL" ? modulesString : new Set(modulesString.split(","));
          break;
        case "out":
          arg = args.shift();
          outputFilename = arg;
          // do not include this in reproArguments needed by --repro[OnFatalError/Unconditionally], as path is likely not portable between environments
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
          let inputSourceMap = args.shift();
          inputSourceMapFilenames.push(inputSourceMap);
          // do not include this in reproArguments needed by --repro[OnFatalError/Unconditionally], as path is likely not portable between environments
          // Furthermore, this is covered when sourcemaps are discovered in prepack-node
          break;
        case "srcmapOut":
          outputSourceMap = args.shift();
          // do not include this in reproArguments needed by --repro[OnFatalError/Unconditionally], as path is likely not portable between environments
          break;
        case "statsFile":
          statsFileName = args.shift();
          // do not include this in reproArguments needed by --repro[OnFatalError/Unconditionally], as path is likely not portable between environments
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
        case "diagnosticAsError":
          let diagnosticAsErrorString = args.shift();
          diagnosticAsError = new Set(diagnosticAsErrorString.split(","));
          reproArguments.push("--diagnosticAsError", diagnosticAsErrorString);
          break;
        case "noDiagnostic":
          let noDiagnosticString = args.shift();
          noDiagnostic = new Set(noDiagnosticString.split(","));
          reproArguments.push("--noDiagnostic", noDiagnosticString);
          break;
        case "warnAsError":
          warnAsError = true;
          reproArguments.push("--warnAsError");
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
          // do not include this in reproArguments needed by --repro[OnFatalError/Unconditionally] as the field is not visable to the user
          break;
        case "debugOutFilePath":
          debugOutFilePath = args.shift();
          // do not include this in reproArguments needed by --repro[OnFatalError/Unconditionally] as the field is not visable to the user
          break;
        case "lazyObjectsRuntime":
          lazyObjectsRuntime = args.shift();
          reproArguments.push("--lazyObjectsRuntime", lazyObjectsRuntime);
          break;
        case "heapGraphFilePath":
          heapGraphFilePath = args.shift();
          // do not include this in reproArguments needed by --repro[OnFatalError/Unconditionally], as path is likely not portable between environments
          break;
        case "dumpIRFilePath":
          dumpIRFilePath = args.shift();
          // do not include this in reproArguments needed by --repro[OnFatalError/Unconditionally], as path is likely not portable between environments
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
        case "reproOnFatalError":
        case "reproUnconditionally":
          debugReproPackager = new DebugReproPackager();
          reproMode = arg;
          reproFilePath = args.shift();
          debugReproArgs = {};
          debugReproArgs.sourcemaps = [];
          if (debuggerConfigArgs.buckRoot) debugReproArgs.buckRoot = debuggerConfigArgs.buckRoot;
          // do not include this in reproArguments needed by --repro[OnFatalError/Unconditionally], as we don't need to create a repro from the repro...
          break;
        case "cpuprofile":
          cpuprofilePath = args.shift();
          // do not include this in reproArguments needed by --repro[OnFatalError/Unconditionally], as path is likely not portable between environments
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
          if (!DiagnosticSeverityValues.includes(arg)) {
            console.error(`Unsupported debugDiagnosticSeverity: ${arg}`);
            process.exit(1);
          }
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
          if (debugReproArgs) debugReproArgs.buckRoot = buckRoot;
          // Use $(pwd)  instead of argument so repro script can be run from
          // any computer, not just the one it was generated on.
          // All sourcefiles are placed directly in the repro, so the repro folder is the buckRoot.
          reproArguments.push("--debugBuckRoot", "$(pwd)");
          break;
        case "externalPrepackPath":
          externalPrepackPath = args.shift();
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
            "--dumpIRFilePath dumpIRFilePath",
            "--reactOutput " + ReactOutputValues.join(" | "),
            "--repro reprofile.zip",
            "--cpuprofile name.cpuprofile",
            "--invariantMode " + InvariantModeValues.join(" | "),
            "--warnAsError",
            "--diagnosticAsError PPxxxx,PPyyyy,...",
            "--noDiagnostic PPxxxx,PPyyyy,...",
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

  let resolvedOptions = Object.assign(
    {},
    {
      compatibility,
      mathRandomSeed,
      inputSourceMapFilenames,
      errorHandler,
      sourceMaps: !!outputSourceMap,
      maxStackDepth,
      timeout,
      debugIdentifiers,
      check,
      serialize: !check,
      lazyObjectsRuntime,
      debugInFilePath,
      debugOutFilePath,
      reactOutput,
      invariantMode,
      invariantLevel,
      debuggerConfigArgs,
      debugReproArgs,
      modulesToInitialize,
    },
    flags
  );
  if (heapGraphFilePath !== undefined) resolvedOptions.heapGraphFormat = "DotLanguage";
  if (dumpIRFilePath !== undefined) {
    resolvedOptions.onExecute = (realm, optimizedFunctions) => {
      let text = "";
      new TextPrinter(line => {
        text += line + "\n";
      }).print(realm, optimizedFunctions);
      invariant(dumpIRFilePath !== undefined);
      fs.writeFileSync(dumpIRFilePath, text);
    };
  }
  if (lazyObjectsRuntime !== undefined && (resolvedOptions.delayInitializations || resolvedOptions.inlineExpressions)) {
    console.error("lazy objects feature is incompatible with delayInitializations and inlineExpressions options");
    process.exit(1);
  }

  let compilerDiagnostics: Map<BabelNodeSourceLocation, CompilerDiagnostic> = new Map();
  let compilerDiagnosticsList: Array<CompilerDiagnostic> = [];
  function errorHandler(compilerDiagnostic: CompilerDiagnostic): ErrorHandlerResult {
    if (noDiagnostic !== undefined && noDiagnostic.has(compilerDiagnostic.errorCode)) return "Recover";
    if (
      (warnAsError && compilerDiagnostic.severity === "Warning") ||
      (diagnosticAsError !== undefined &&
        diagnosticAsError.has(compilerDiagnostic.errorCode) &&
        compilerDiagnostic.severity !== "FatalError")
    ) {
      compilerDiagnostic = new CompilerDiagnostic(
        compilerDiagnostic.message,
        compilerDiagnostic.location,
        compilerDiagnostic.errorCode,
        "RecoverableError",
        compilerDiagnostic.sourceFilePaths
      );
    }
    if (compilerDiagnostic.location) compilerDiagnostics.set(compilerDiagnostic.location, compilerDiagnostic);
    else compilerDiagnosticsList.push(compilerDiagnostic);
    return compilerDiagnostic.severity === "FatalError" ? "Fail" : "Recover";
  }

  function printDiagnostics(caughtFatalError: boolean, caughtUnexpectedError: boolean = false): boolean {
    if (compilerDiagnostics.size === 0 && compilerDiagnosticsList.length === 0) {
      // FatalErrors must have generated at least one CompilerDiagnostic.
      invariant(!caughtFatalError, "FatalError must generate at least one CompilerDiagnostic");
      return !caughtUnexpectedError;
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
    const success = fatalErrors === 0 && recoverableErrors === 0 && !caughtUnexpectedError;
    console.error(
      `Prepack ${success ? "succeeded" : "failed"}, reporting ${[
        fatalErrors > 0 ? `${fatalErrors} ${plural(fatalErrors, "fatal error")}` : undefined,
        recoverableErrors > 0 ? `${recoverableErrors} ${plural(recoverableErrors, "recoverable error")}` : undefined,
        warnings > 0 ? `${warnings} ${plural(warnings, "warning")}` : undefined,
        informations > 0 ? `${informations} ${plural(informations, "informational message")}` : undefined,
      ]
        .filter(s => s !== undefined)
        .join(", ")}.`
    );

    return success;
  }

  let profiler;
  let success;
  let debugReproSourceFiles = [];
  let debugReproSourceMaps = [];

  try {
    if (cpuprofilePath !== undefined) {
      try {
        profiler = require("v8-profiler-node8");
      } catch (e) {
        // Profiler optional dependency failed
        console.error("v8-profiler-node8 doesn't work correctly on Windows, see issue #1695");
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
      if (reproMode === "reproUnconditionally") {
        if (serialized.sourceFilePaths) {
          debugReproSourceFiles = serialized.sourceFilePaths.sourceFiles;
          debugReproSourceMaps = serialized.sourceFilePaths.sourceMaps;
        } else {
          // An input can have no sourcemap/sourcefiles, but we can still package
          // the input files, prepack runtime, and generate the script.
          debugReproSourceFiles = [];
          debugReproSourceMaps = [];
        }
      }

      success = printDiagnostics(false);
      if (resolvedOptions.serialize && serialized) processSerializedCode(serialized);
    } catch (err) {
      success = printDiagnostics(err instanceof FatalError, !(err instanceof FatalError));
      invariant(!success);
      if (!(err instanceof FatalError)) {
        // if it is not a FatalError, it means prepack failed, and we should display the Prepack stack trace.
        console.error(`unexpected ${err}:\n${err.stack}`);
      }
      if (reproMode) {
        // Get largest list of original sources from all diagnostics.
        // Must iterate through both because maps are ordered so we can't tell which diagnostic is most recent.
        let largestLength = 0;

        let allDiagnostics = Array.from(compilerDiagnostics.values()).concat(compilerDiagnosticsList);
        allDiagnostics.forEach(diagnostic => {
          if (
            diagnostic.sourceFilePaths &&
            diagnostic.sourceFilePaths.sourceFiles &&
            diagnostic.sourceFilePaths.sourceMaps
          ) {
            if (diagnostic.sourceFilePaths.sourceFiles.length > largestLength) {
              debugReproSourceFiles = diagnostic.sourceFilePaths.sourceFiles;
              largestLength = diagnostic.sourceFilePaths.sourceFiles.length;
              debugReproSourceMaps = diagnostic.sourceFilePaths.sourceMaps;
            }
          }
        });
      }
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

  // If there will be a repro going on, don't exit.
  // The repro involves an async directory zip, so exiting here will cause the repro
  // to not complete. Instead, all calls to repro include a flag to indicate
  // whether or not it should process.exit() upon completion.
  if (!success && reproMode === undefined) {
    process.exit(1);
  } else if ((!success && reproMode === "reproOnFatalError") || reproMode === "reproUnconditionally") {
    if (debugReproPackager) {
      debugReproPackager.generateDebugRepro(
        !success,
        debugReproSourceFiles,
        debugReproSourceMaps,
        reproFilePath,
        reproFileNames,
        reproArguments,
        externalPrepackPath
      );
    } else {
      console.error("Debug Repro Packager was not initialized.");
      process.exit(1);
    }
  }
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
