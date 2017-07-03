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
import { type Options, defaultOptions } from "./options";
import { prepackNodeCLI, prepackNodeCLISync } from "./prepack-node-environment.js";
import { prepackString } from "./prepack-standalone.js";
import { type SourceMap } from "./types.js";

import fs from "fs";

export * from "./prepack-node-environment";
export * from "./prepack-standalone";

export function prepackStdin(
  options: Options = defaultOptions,
  callback: (any, ?{ code: string, map?: SourceMap }) => void
) {
  let sourceMapFilename = options.inputSourceMapFilename || "";
  process.stdin.setEncoding("utf8");
  process.stdin.resume();
  process.stdin.on("data", function(code) {
    fs.readFile(sourceMapFilename, "utf8", function(mapErr, sourceMap) {
      if (mapErr) {
        console.warn(`No sourcemap found at ${sourceMapFilename}.`);
        sourceMap = "";
      }
      let filename = "no-filename-specified";
      let serialized;
      try {
        serialized = prepackString(filename, code, sourceMap, options);
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
  options: Options = defaultOptions,
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
        serialized = prepackString(filename, code, sourceMap, options);
      } catch (err) {
        callback(err, null);
        return;
      }
      callback(null, serialized);
    });
  });
}

export function prepackFileSync(filename: string, options: Options = defaultOptions) {
  if (options.compatibility === "node-cli") {
    return prepackNodeCLISync(filename, options);
  }
  let code = fs.readFileSync(filename, "utf8");
  let sourceMap = "";
  let sourceMapFilename = options.inputSourceMapFilename || filename + ".map";
  try {
    sourceMap = fs.readFileSync(sourceMapFilename, "utf8");
  } catch (_e) {
    if (options.inputSourceMapFilename) console.warn(`No sourcemap found at ${sourceMapFilename}.`);
  }
  return prepackString(filename, code, sourceMap, options);
}
