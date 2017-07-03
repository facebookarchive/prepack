/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

/* APIs for running Prepack for code where a model of the environment is supplied as part of the code. */

import Serializer from "./serializer/index.js";
import construct_realm from "./construct_realm.js";
import initializeGlobals from "./globals.js";
import * as t from "babel-types";
import { getRealmOptions, getSerializerOptions } from "./options";
import { FatalError } from "./errors.js";
import { SerializerStatistics } from "./serializer/types.js";

import { AbruptCompletion } from "./completions.js";
import type { Options } from "./options";
import { defaultOptions } from "./options";
import type { BabelNodeFile, BabelNodeProgram } from "babel-types";
import invariant from "./invariant.js";

// IMPORTANT: This function is now deprecated and will go away in a future release.
// Please use FatalError instead.
export function InitializationError() {
  let self = new Error("An error occurred while prepacking. See the error logs.");
  Object.setPrototypeOf(self, InitializationError.prototype);
  return self;
}
Object.setPrototypeOf(InitializationError, Error);
Object.setPrototypeOf(InitializationError.prototype, Error.prototype);
Object.setPrototypeOf(FatalError.prototype, InitializationError.prototype);

export function prepackString(
  filename: string, code: string, sourceMap: string,
  options: Options = defaultOptions,
): { code: string, map?: SourceMap, statistics?: SerializerStatistics } {
  let realmOptions = getRealmOptions(options);
  let realm = construct_realm(realmOptions);
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
     throw new FatalError("serializer failed");
   }
   if (!options.residual) return serialized;
   let result = realm.$GlobalEnv.executePartialEvaluator(
     filename, serialized.code, JSON.stringify(serialized.map));
   if (result instanceof AbruptCompletion) throw result;
   return (result: any);
  } else {
   invariant(options.residual);
   let result = realm.$GlobalEnv.executePartialEvaluator(filename, code, sourceMap);
   if (result instanceof AbruptCompletion) throw result;
   return (result: any);
  }
}

/* deprecated: please use prepackString instead. */
export function prepack(code: string, options: Options = defaultOptions) {
  let filename = options.filename || 'unknown';

  let realmOptions = getRealmOptions(options);
  realmOptions.errorHandler = options.onError;
  let realm = construct_realm(realmOptions);
  initializeGlobals(realm);

  let serializer = new Serializer(realm, getSerializerOptions(options));
  let serialized = serializer.init(filename, code, "", options.sourceMaps);
  if (!serialized) {
    throw new FatalError("serializer failed");
  }
  return serialized;
}

/* deprecated: pelase use prepackString instead. */
export function prepackFromAst(ast: BabelNodeFile | BabelNodeProgram, code: string, options: Options = defaultOptions) {
  if (ast && ast.type === "Program") {
    ast = t.file(ast, [], []);
  } else if (!ast || ast.type !== "File") {
    throw new Error("Not a valid ast?");
  }

  // TODO: Expose an option to wire an already parsed ast all the way through
  // to the execution environment. For now, we just reparse.

  let realm = construct_realm(getRealmOptions(options));
  initializeGlobals(realm);
  let serializer = new Serializer(realm, getSerializerOptions(options));
  let serialized = serializer.init("", code, "", options.sourceMaps);
  if (!serialized) {
    throw new FatalError("serializer failed");
  }
  return serialized;
}
