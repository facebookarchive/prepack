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
import { getRealmOptions, getSerializerOptions } from "./options";

import type { Options } from "./options";
import { defaultOptions } from "./options";
import type { BabelNodeFile, BabelNodeProgram } from "babel-types";

// This should just be a class but Babel classes doesn't work with
// built-in super classes.
export function InitializationError() {
  let self = new Error("An error occurred while prepacking. See the error logs.");
  Object.setPrototypeOf(self, InitializationError.prototype);
  return self;
}
Object.setPrototypeOf(InitializationError, Error);
Object.setPrototypeOf(InitializationError.prototype, Error.prototype);


export function prepack(code: string, options: Options = defaultOptions) {
  let filename = options.filename || 'unknown';
  let realm = construct_realm(getRealmOptions(options));
  initializeGlobals(realm);
  let serializer = new Serializer(realm, getSerializerOptions(options));
  let serialized = serializer.init(filename, code, options.inputSourceMap, options.sourceMaps);
  if (!serialized) {
    throw new InitializationError();
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
  let serialized = serializer.init("", code, options.inputSourceMap, options.sourceMaps);
  if (!serialized) {
    throw new InitializationError();
  }
  return serialized;
}
