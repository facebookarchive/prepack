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
import construct_realm from "./construct_realm.js";
import initializeGlobals from "./globals.js";
import fs from "fs";
import { AbruptCompletion } from "./completions.js";
import { getRealmOptions, getSerializerOptions } from "./options";
import { InitializationError } from "./prepack-standalone";
import { prepackNodeCLI, prepackNodeCLISync } from "./prepack-node-environment";

import type { Options } from "./options";
import { defaultOptions } from "./options";
import type { SourceMap } from "./types.js";
import invariant from "./invariant.js";

export * from "./prepack-standalone";
export * from "./prepack-node-environment";

export function prepackString(filename: string, code: string, sourceMap: string,
     options: Options = defaultOptions): { code: string, map?: SourceMap } {
   let realm = construct_realm(getRealmOptions(options));
   initializeGlobals(realm);
   if (options.serialize || !options.residual) {
     let serializer = new Serializer(
       realm,
       getSerializerOptions(options),
     );
     let serialized = serializer.init(
       options.filename || filename,
       code,
       sourceMap,
       options.sourceMaps
     );
     if (!serialized) {
       throw new InitializationError();
     }
     if (!options.residual) return serialized;
     let result = realm.$GlobalEnv.executePartialEvaluator(
       filename, serialized.code, JSON.stringify(serialized.map));
     if (result instanceof AbruptCompletion) throw result;
     return result;
   } else {
     invariant(options.residual);
     let result = realm.$GlobalEnv.executePartialEvaluator(filename, code, sourceMap);
     if (result instanceof AbruptCompletion) throw result;
     return result;
   }
}

export function prepackStdin(
    options: Options = defaultOptions,
    callback: ({code: string, map?: SourceMap})=>void) {
  let sourceMapFilename = options.inputSourceMapFilename || '';
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  process.stdin.on('data', function (code) {
    fs.readFile(sourceMapFilename, "utf8", function (mapErr, sourceMap) {
      if (mapErr) {
        console.warn(`No sourcemap found at ${sourceMapFilename}.`);
        sourceMap = "";
      }
      let filename = 'no-filename-specified';
      let serialized;
      try {
        serialized = prepackString(filename, code, sourceMap, options);
      } catch (err) {
        callback(err);
        return;
      }
      callback(serialized);
    });
  });
}

export function prepackFile(
    filename: string,
    options: Options = defaultOptions,
    callback: ({code: string, map?: SourceMap})=>void,
    errorHandler?: (err: ?Error)=>void) {
  if (options.compatibility === 'node-cli') {
    prepackNodeCLI(filename, options, callback);
    return;
  }
  let sourceMapFilename = options.inputSourceMapFilename || (filename + ".map");
  fs.readFile(filename, "utf8", function(fileErr, code) {
    if (fileErr) {
      if (errorHandler) errorHandler(fileErr);
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
        callback(err);
        return;
      }
      callback(serialized);
    });
  });
}

export function prepackFileSync(filename: string, options: Options = defaultOptions) {
  if (options.compatibility === 'node-cli') {
    return prepackNodeCLISync(filename, options);
  }
  let code = fs.readFileSync(filename, "utf8");
  let sourceMap = "";
  let sourceMapFilename = options.inputSourceMapFilename || (filename + ".map");
  try {
    sourceMap = fs.readFileSync(sourceMapFilename, "utf8");
  } catch (_e) {
    console.warn(`No sourcemap found at ${sourceMapFilename}.`);
  }
  return prepackString(filename, code, sourceMap, options);
}
