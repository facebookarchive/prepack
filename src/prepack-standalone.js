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
import * as t from "babel-types";
import { FatalError } from "./errors.js";
import { getRealmOptions, getSerializerOptions } from "./options";
import { type ErrorHandler, fatalError } from "./errors.js";

import type { Options } from "./options";
import { defaultOptions } from "./options";
import type { BabelNodeFile, BabelNodeProgram } from "babel-types";

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

export function prepack(code: string, options: Options = defaultOptions, errorHandler?: ErrorHandler) {
  let filename = options.filename || 'unknown';

  let realmOptions = getRealmOptions(options);
  realmOptions.errorHandler = errorHandler;
  let realm = construct_realm(realmOptions);
  initializeGlobals(realm);

  let serializer = new Serializer(realm, getSerializerOptions(options));
  let serialized = serializer.init(filename, code, "", options.sourceMaps);
  if (!serialized) {
    throw fatalError;
  }
  return serialized;
}

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
    throw fatalError;
  }
  return serialized;
}
