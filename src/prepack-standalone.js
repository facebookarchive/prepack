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
import { getRealmOptions, getSerializerOptions } from "./prepack-options";
import { FatalError } from "./errors.js";
import type { SourceFile } from "./types.js";
import { AbruptCompletion } from "./completions.js";
import type { PrepackOptions } from "./prepack-options";
import { defaultOptions } from "./options";
import type { BabelNodeFile, BabelNodeProgram } from "babel-types";
import invariant from "./invariant.js";
import { version } from "../package.json";
import type { DebugChannel } from "./debugger/server/channel/DebugChannel.js";
import type { SerializedResult } from "./serializer/types.js";

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

function validateOptions(options: PrepackOptions) {
  if (
    options.lazyObjectsRuntime &&
    (options.additionalFunctions || options.delayInitializations || options.inlineExpressions)
  ) {
    console.error(
      "lazy objects feature is incompatible with additionalFunctions, delayInitializations and inlineExpressions options"
    );
    process.exit(1);
  }

  if (options.inlineLazyObjects && !options.lazyObjectsRuntime) {
    console.error("--inlineLazyObjects must be used together with --lazyObjectsRuntime");
    process.exit(1);
  }
}

export function prepackSources(
  sources: Array<SourceFile>,
  options: PrepackOptions = defaultOptions,
  debugChannel: DebugChannel | void = undefined
): SerializedResult {
  validateOptions(options);
  let realmOptions = getRealmOptions(options);
  realmOptions.errorHandler = options.errorHandler;
  let realm = construct_realm(realmOptions, debugChannel);
  initializeGlobals(realm);
  if (typeof options.additionalGlobals === "function") {
    options.additionalGlobals(realm);
  }

  if (options.serialize || !options.residual) {
    let serializer = new Serializer(realm, getSerializerOptions(options));
    let serialized = serializer.init(sources, options.sourceMaps);

    //Turn off the debugger if there is one
    if (realm.debuggerInstance) {
      realm.debuggerInstance.shutdown();
    }

    if (!serialized) {
      throw new FatalError("serializer failed");
    }

    if (!options.residual) return serialized;
    let residualSources = [
      {
        filePath: options.outputFilename || "unknown",
        fileContents: serialized.code,
        sourceMapContents: JSON.stringify(serialized.map),
      },
    ];
    let result = realm.$GlobalEnv.executePartialEvaluator(residualSources, options);
    if (result instanceof AbruptCompletion) throw result;
    // $FlowFixMe This looks like a Flow bug
    return result;
  } else {
    invariant(options.residual);
    let result = realm.$GlobalEnv.executePartialEvaluator(sources, options);
    if (result instanceof AbruptCompletion) throw result;
    // $FlowFixMe This looks like a Flow bug
    return result;
  }
}

/* deprecated: please use prepackSources instead. */
export function prepackString(
  filename: string,
  code: string,
  sourceMap: string,
  options: PrepackOptions = defaultOptions
): SerializedResult {
  return prepackSources([{ filePath: filename, fileContents: code, sourceMapContents: sourceMap }], options);
}

/* deprecated: please use prepackSources instead. */
export function prepack(code: string, options: PrepackOptions = defaultOptions) {
  let filename = options.filename || "unknown";
  let sources = [{ filePath: filename, fileContents: code }];

  let realmOptions = getRealmOptions(options);
  realmOptions.errorHandler = options.errorHandler;
  let realm = construct_realm(realmOptions);
  initializeGlobals(realm);

  let serializer = new Serializer(realm, getSerializerOptions(options));
  let serialized = serializer.init(sources, options.sourceMaps);
  if (!serialized) {
    throw new FatalError("serializer failed");
  }
  return serialized;
}

/* deprecated: please use prepackSources instead. */
export function prepackFromAst(
  ast: BabelNodeFile | BabelNodeProgram,
  code: string,
  options: PrepackOptions = defaultOptions
) {
  if (ast && ast.type === "Program") {
    ast = t.file(ast, [], []);
  }
  invariant(ast && ast.type === "File");
  let filename = options.filename || (ast.loc && ast.loc.source) || "unknown";
  let sources = [{ filePath: filename, fileContents: code }];

  let realm = construct_realm(getRealmOptions(options));
  initializeGlobals(realm);
  let serializer = new Serializer(realm, getSerializerOptions(options));
  let serialized = serializer.init(sources, options.sourceMaps);
  if (!serialized) {
    throw new FatalError("serializer failed");
  }
  return serialized;
}

export const prepackVersion = version;
