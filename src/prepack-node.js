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
import { getRealmOptions, getSerializerOptions } from "./options";
import { InitializationError } from "./prepack-standalone";

import type { Options } from "./options";
import { defaultOptions } from "./options";

export * from "./prepack-standalone";

export function prepackFile(filename: string, options: Options = defaultOptions, callback: Function) {
  let sourceMapFilename = options.inputSourceMapFilename || (filename + ".map");
  fs.readFile(filename, "utf8", function(fileErr, code) {
    if (fileErr) {
      callback(fileErr);
      return;
    }
    fs.readFile(sourceMapFilename, "utf8", function(mapErr, sourceMap) {
      if (mapErr) {
        console.log(`No sourcemap found at ${sourceMapFilename}.`);
        sourceMap = "";
      }
      let serialized;
      try {
        let realm = construct_realm(getRealmOptions(options));
        initializeGlobals(realm);
        let serializer = new Serializer(
          realm,
          getSerializerOptions(options),
        );
        serialized = serializer.init(
          options.filename || filename,
          code,
          sourceMap,
          options.sourceMaps
        );
        if (!serialized) {
          throw new InitializationError();
        }
      } catch (err) {
        callback(err);
        return;
      }
      callback(null, serialized);
    });
  });
}

export function prepackFileSync(filename: string, options: Options = defaultOptions) {
  let code = fs.readFileSync(filename, "utf8");
  let sourceMap = "";
  let sourceMapFilename = options.inputSourceMapFilename || (filename + ".map");
  try {
    sourceMap = fs.readFileSync(sourceMapFilename, "utf8");
  } catch (_e) {
    console.log(`No sourcemap found at ${sourceMapFilename}.`);
  }
  let realm = construct_realm(getRealmOptions(options));
  initializeGlobals(realm);
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
  return serialized;
}
