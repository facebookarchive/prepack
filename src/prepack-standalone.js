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
import invariant from "./invariant.js";
import * as t from "babel-types";
import { getRealmOptions, getSerializerOptions } from "./options";

import type { Options } from "./options";
import type { BabelNodeFile, BabelNodeProgram } from "babel-types";

export function prepack(code: string, options: Options = {}) {
  let filename = options.filename || 'unknown';
  let serialized = new Serializer(
    getRealmOptions(options),
    getSerializerOptions(options),
  ).init(filename, code, "", false);
  invariant(serialized);
  return serialized;
}

export function prepackFromAst(ast: BabelNodeFile | BabelNodeProgram, code: string, options: Options = {}) {
  if (ast && ast.type === "Program") {
    ast = t.file(ast, [], []);
  } else if (!ast || ast.type !== "File") {
    throw new Error("Not a valid ast?");
  }

  // TODO: Expose an option to wire an already parsed ast all the way through
  // to the execution environment. For now, we just reparse.

  let serialized = new Serializer(
    getRealmOptions(options),
    getSerializerOptions(options),
  ).init("", code, "", options.sourceMaps);
  invariant(serialized);
  return serialized;
}
