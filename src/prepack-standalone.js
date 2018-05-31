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
import type { SourceFile } from "./types.js";
import { AbruptCompletion } from "./completions.js";
import type { PrepackOptions } from "./prepack-options";
import { defaultOptions } from "./options";
import invariant from "./invariant.js";
import { version } from "../package.json";
import type { DebugChannel } from "./debugger/server/channel/DebugChannel.js";
import { type SerializedResult } from "./serializer/types.js";
import { SerializerStatistics } from "./serializer/statistics.js";
import { ResidualHeapVisitor } from "./serializer/ResidualHeapVisitor.js";
import { Modules } from "./utils/modules.js";
import { Logger } from "./utils/logger.js";
import { Generator } from "./utils/generator.js";
import { AbstractObjectValue, AbstractValue, ObjectValue } from "./values/index.js";

export function prepackSources(
  sources: Array<SourceFile>,
  options: PrepackOptions = defaultOptions,
  debugChannel: DebugChannel | void = undefined,
  statistics: SerializerStatistics | void = undefined
): SerializedResult {
  let realmOptions = getRealmOptions(options);
  realmOptions.errorHandler = options.errorHandler;
  let realm = construct_realm(realmOptions, debugChannel, statistics || new SerializerStatistics());
  initializeGlobals(realm);
  if (typeof options.additionalGlobals === "function") {
    options.additionalGlobals(realm);
  }

  if (options.check) {
    realm.generator = new Generator(realm, "main");
    let logger = new Logger(realm, !!options.internalDebug);
    let modules = new Modules(
      realm,
      logger,
      !!options.logModules,
      !!options.delayUnsupportedRequires,
      !!options.accelerateUnsupportedRequires
    );
    let [result] = realm.$GlobalEnv.executeSources(sources);
    if (result instanceof AbruptCompletion) throw result;
    invariant(options.check);
    checkResidualFunctions(modules, options.check[0], options.check[1]);
    return { code: "", map: undefined };
  } else if (options.serialize === true || options.residual !== true) {
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
        sourceMapContents: serialized.map && JSON.stringify(serialized.map),
      },
    ];
    realm = construct_realm(realmOptions, debugChannel);
    initializeGlobals(realm);
    if (typeof options.additionalGlobals === "function") {
      options.additionalGlobals(realm);
    }
    realm.generator = new Generator(realm, "main");
    let result = realm.$GlobalEnv.executePartialEvaluator(residualSources, options);
    if (result instanceof AbruptCompletion) throw result;
    return { ...result };
  } else {
    invariant(options.residual);
    realm.generator = new Generator(realm, "main");
    let result = realm.$GlobalEnv.executePartialEvaluator(sources, options);
    if (result instanceof AbruptCompletion) throw result;
    return { ...result };
  }
}

function checkResidualFunctions(modules: Modules, startFunc: number, totalToAnalyze: number) {
  let realm = modules.realm;
  let env = realm.$GlobalEnv;
  realm.$GlobalObject.makeSimple();
  let errorHandler = realm.errorHandler;
  if (!errorHandler) errorHandler = diag => realm.handleError(diag);
  realm.errorHandler = diag => {
    invariant(errorHandler);
    if (diag.severity === "FatalError") return errorHandler(diag);
    else return "Recover";
  };
  modules.resolveInitializedModules();
  let residualHeapVisitor = new ResidualHeapVisitor(realm, modules.logger, modules, new Map(), "NO_REFERENTIALIZE");
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
