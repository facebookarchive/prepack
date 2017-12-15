/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/*
 Prepack API functions that require Node as the execution environment for Prepack.
 */

/* @flow */
import { defaultOptions } from "./options";
import { type PrepackOptions } from "./prepack-options";
import { getDebuggerOptions } from "./prepack-options";
import { prepackNodeCLI, prepackNodeCLISync } from "./prepack-node-environment.js";
import { prepackSources } from "./prepack-standalone.js";
import { type SourceMap } from "./types.js";
import { DebugChannel } from "./debugger/server/channel/DebugChannel.js";
import { FileIOWrapper } from "./debugger/common/channel/FileIOWrapper.js";
import type { SerializedResult } from "./serializer/types.js";

import fs from "fs";

export * from "./prepack-node-environment";
export * from "./prepack-standalone";

export function prepackStdin(options: PrepackOptions = defaultOptions, callback: (any, ?SerializedResult) => void) {
  let sourceMapFilename = options.inputSourceMapFilename || "";
  process.stdin.setEncoding("utf8");
  process.stdin.resume();
  process.stdin.on("data", function(code) {
    fs.readFile(sourceMapFilename, "utf8", function(mapErr, sourceMap) {
      if (mapErr) {
        //if no sourcemap was provided we silently ignore
        if (sourceMapFilename !== "") console.warn(`No sourcemap found at ${sourceMapFilename}.`);
        sourceMap = "";
      }
      let filename = "no-filename-specified";
      let serialized;
      try {
        serialized = prepackSources(
          [
            {
              filePath: filename,
              fileContents: code,
              sourceMapContents: sourceMap,
            },
          ],
          options
        );
      } catch (err) {
        callback(err, null);
        return;
      }
      callback(null, serialized);
    });
  });
}

export function prepackFile(
  filename: string,
  options: PrepackOptions = defaultOptions,
  callback: (any, ?{ code: string, map?: SourceMap }) => void,
  fileErrorHandler?: (err: ?Error) => void
) {
  if (options.compatibility === "node-cli") {
    prepackNodeCLI(filename, options, callback);
    return;
  }
  let sourceMapFilename = options.inputSourceMapFilename || filename + ".map";
  fs.readFile(filename, "utf8", function(fileErr, code) {
    if (fileErr) {
      if (fileErrorHandler) fileErrorHandler(fileErr);
      return;
    }
    fs.readFile(sourceMapFilename, "utf8", function(mapErr, sourceMap) {
      if (mapErr) {
        console.warn(`No sourcemap found at ${sourceMapFilename}.`);
        sourceMap = "";
      }
      let serialized;
      try {
        serialized = prepackSources(
          [
            {
              filePath: filename,
              fileContents: code,
              sourceMapContents: sourceMap,
            },
          ],
          options
        );
      } catch (err) {
        callback(err, null);
        return;
      }
      callback(null, serialized);
    });
  });
}

export function prepackFileSync(filenames: Array<string>, options: PrepackOptions = defaultOptions) {
  if (options.compatibility === "node-cli") {
    if (filenames.length !== 1) {
      console.error(`Does not support multiple file prepack in node-cli mode.`);
      process.exit(1);
    }
    return prepackNodeCLISync(filenames[0], options);
  }
  const sourceFiles = filenames.map(filename => {
    let code = fs.readFileSync(filename, "utf8");
    let sourceMap = "";
    let sourceMapFilename = options.inputSourceMapFilename || filename + ".map";
    try {
      sourceMap = fs.readFileSync(sourceMapFilename, "utf8");
    } catch (_e) {
      if (options.inputSourceMapFilename) console.warn(`No sourcemap found at ${sourceMapFilename}.`);
    }
    return {
      filePath: filename,
      fileContents: code,
      sourceMapContents: sourceMap,
    };
  });
  let debugChannel;
  if (options.debugInFilePath && options.debugOutFilePath) {
    let debugOptions = getDebuggerOptions(options);
    let ioWrapper = new FileIOWrapper(false, debugOptions.inFilePath, debugOptions.outFilePath);
    debugChannel = new DebugChannel(ioWrapper);
  }
  return prepackSources(sourceFiles, options, debugChannel);
}
