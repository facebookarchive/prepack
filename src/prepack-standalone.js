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
import { EvaluateDirectCallWithArgList } from "./methods/index.js";
import { getRealmOptions, getSerializerOptions } from "./prepack-options";
import { FatalError } from "./errors.js";
import { SourceFileCollection, type SourceFile } from "./types.js";
import { AbruptCompletion } from "./completions.js";
import type { PrepackOptions } from "./prepack-options";
import { defaultOptions } from "./options";
import invariant from "./invariant.js";
import { version } from "../package.json";
import { type SerializedResult } from "./serializer/types.js";
import { SerializerStatistics } from "./serializer/statistics.js";
import { ResidualHeapVisitor } from "./serializer/ResidualHeapVisitor.js";
import { Modules } from "./utils/modules.js";
import { Logger } from "./utils/logger.js";
import { Generator } from "./utils/generator.js";
import { AbstractObjectValue, AbstractValue, ObjectValue } from "./values/index.js";

export function prepackSources(
  sourceFileCollection: SourceFileCollection | Array<SourceFile>,
  options: PrepackOptions = defaultOptions,
  statistics: SerializerStatistics | void = undefined
): SerializedResult {
  if (Array.isArray(sourceFileCollection)) sourceFileCollection = new SourceFileCollection(sourceFileCollection);

  let realmOptions = getRealmOptions(options);
  realmOptions.errorHandler = options.errorHandler;
  let realm = construct_realm(
    realmOptions,
    options.debuggerConfigArgs,
    statistics || new SerializerStatistics(),
    options.debugReproArgs
  );
  initializeGlobals(realm);
  if (typeof options.additionalGlobals === "function") {
    options.additionalGlobals(realm);
  }

  if (options.check) {
    realm.generator = new Generator(realm, "main", realm.pathConditions);
    let logger = new Logger(realm, !!options.internalDebug);
    let modules = new Modules(realm, logger, !!options.logModules);
    let [result] = realm.$GlobalEnv.executeSources(sourceFileCollection.toArray());
    if (result instanceof AbruptCompletion) throw result;
    invariant(options.check);
    checkResidualFunctions(modules, options.check[0], options.check[1]);
    return { code: "", map: undefined };
  } else {
    let serializer = new Serializer(realm, getSerializerOptions(options));
    let serialized = serializer.init(sourceFileCollection, options.sourceMaps, options.onParse, options.onExecute);

    //Turn off the debugger if there is one
    if (realm.debuggerInstance) {
      realm.debuggerInstance.shutdown();
    }

    if (!serialized) {
      throw new FatalError("serializer failed");
    }

    if (realm.debugReproManager) {
      let localManager = realm.debugReproManager;
      let sourcePaths = {
        sourceFiles: localManager.getSourceFilePaths(),
        sourceMaps: localManager.getSourceMapPaths(),
      };
      serialized.sourceFilePaths = sourcePaths;
    }

    return serialized;
  }
}

function checkResidualFunctions(modules: Modules, startFunc: number, totalToAnalyze: number) {
  let realm = modules.realm;
  let env = realm.$GlobalEnv;
  realm.$GlobalObject.makeSimple();
  let errorHandler = realm.errorHandler;
  if (!errorHandler) errorHandler = (diag, suppressDiagnostics) => realm.handleError(diag);
  realm.errorHandler = (diag, suppressDiagnostics) => {
    invariant(errorHandler);
    if (diag.severity === "FatalError") return errorHandler(diag, realm.suppressDiagnostics);
    else return "Recover";
  };
  modules.resolveInitializedModules();
  let residualHeapVisitor = new ResidualHeapVisitor(realm, modules.logger, modules, new Map());
  residualHeapVisitor.visitRoots();
  if (modules.logger.hasErrors()) return;
  let totalFunctions = 0;
  let nonFatalFunctions = 0;
  for (let fi of residualHeapVisitor.functionInstances.values()) {
    totalFunctions++;
    if (totalFunctions <= startFunc) continue;
    let fv = fi.functionValue;
    console.log("analyzing: " + totalFunctions);
    let thisValue = realm.intrinsics.null;
    let n = fv.getLength() || 0;
    let args = [];
    for (let i = 0; i < n; i++) {
      let name = "dummy parameter";
      let ob: AbstractObjectValue = (AbstractValue.createFromType(realm, ObjectValue, name): any);
      ob.makeSimple("transitive");
      ob.intrinsicName = name;
      args[i] = ob;
    }
    // todo: eventually join these effects, apply them to the global state and iterate to a fixed point
    try {
      realm.evaluateForEffectsInGlobalEnv(() =>
        EvaluateDirectCallWithArgList(modules.realm, true, env, fv, fv, thisValue, args)
      );
      nonFatalFunctions++;
    } catch (e) {}
    if (totalFunctions >= startFunc + totalToAnalyze) break;
  }
  console.log(
    `Analyzed ${totalToAnalyze} functions starting at ${startFunc} of which ${nonFatalFunctions} did not have fatal errors.`
  );
}

export const prepackVersion = version;
