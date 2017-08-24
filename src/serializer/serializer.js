/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm, ExecutionContext } from "../realm.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import type { SourceFile } from "../types.js";
import { AbruptCompletion } from "../completions.js";
import { Generator } from "../utils/generator.js";
import generate from "babel-generator";
import type SourceMap from "babel-generator";
import traverseFast from "../utils/traverse-fast.js";
import invariant from "../invariant.js";
import type { SerializerOptions } from "../options.js";
import { TimingStatistics, SerializerStatistics } from "./types.js";
import { Functions } from "./functions.js";
import { Logger } from "./logger.js";
import { Modules } from "./modules.js";
import { LoggingTracer } from "./LoggingTracer.js";
import { ResidualHeapVisitor } from "./ResidualHeapVisitor.js";
import { ResidualHeapSerializer } from "./ResidualHeapSerializer.js";
import { ResidualHeapValueIdentifiers } from "./ResidualHeapValueIdentifiers.js";
import * as t from "babel-types";

export class Serializer {
  constructor(realm: Realm, serializerOptions: SerializerOptions = {}) {
    invariant(realm.useAbstractInterpretation);
    // Start tracking mutations
    realm.generator = new Generator(realm);

    this.realm = realm;
    this.logger = new Logger(this.realm, !!serializerOptions.internalDebug);
    this.modules = new Modules(
      this.realm,
      this.logger,
      !!serializerOptions.logModules,
      !!serializerOptions.delayUnsupportedRequires
    );
    this.functions = new Functions(this.realm, serializerOptions.additionalFunctions, this.modules.moduleTracer);
    if (serializerOptions.trace) this.realm.tracers.push(new LoggingTracer(this.realm));

    this.options = serializerOptions;
  }

  realm: Realm;
  functions: Functions;
  logger: Logger;
  modules: Modules;
  options: SerializerOptions;

  _execute(sources: Array<SourceFile>, sourceMaps?: boolean = false) {
    let realm = this.realm;
    let [res, code] = realm.$GlobalEnv.executeSources(sources, "script", ast => {
      let realmPreludeGenerator = realm.preludeGenerator;
      invariant(realmPreludeGenerator);
      let forbiddenNames = realmPreludeGenerator.nameGenerator.forbiddenNames;
      traverseFast(ast, node => {
        if (!t.isIdentifier(node)) return false;

        forbiddenNames.add(((node: any): BabelNodeIdentifier).name);
        return true;
      });
    });

    if (res instanceof AbruptCompletion) {
      let context = new ExecutionContext();
      realm.pushContext(context);
      try {
        this.logger.logCompletion(res);
      } finally {
        realm.popContext(context);
      }
      let diagnostic = new CompilerDiagnostic("Global code may end abruptly", res.location, "PP0016", "FatalError");
      realm.handleError(diagnostic);
      throw new FatalError();
    }
    return code;
  }

  init(
    sources: Array<SourceFile>,
    sourceMaps?: boolean = false
  ): void | {
    code: string,
    map: void | SourceMap,
    statistics?: SerializerStatistics,
    timingStats?: TimingStatistics,
  } {
    // Phase 1: Let's interpret.
    let timingStats = this.options.profile ? new TimingStatistics() : undefined;
    if (timingStats !== undefined) {
      timingStats.totalTime = Date.now();
      timingStats.globalCodeTime = Date.now();
    }
    let code = this._execute(sources);
    if (timingStats !== undefined) timingStats.globalCodeTime = Date.now() - timingStats.globalCodeTime;
    if (this.logger.hasErrors()) return undefined;
    this.modules.resolveInitializedModules();
    if (this.options.additionalFunctions) {
      this.functions.checkThatFunctionsAreIndependent();
    }

    if (this.options.initializeMoreModules) {
      if (timingStats !== undefined) timingStats.initializeMoreModulesTime = Date.now();
      this.modules.initializeMoreModules();
      if (this.logger.hasErrors()) return undefined;
      if (timingStats !== undefined)
        timingStats.initializeMoreModulesTime = Date.now() - timingStats.initializeMoreModulesTime;
    }

    let additionalFunctionValuesAndEffects = this.functions.getAdditionalFunctionValuesToEffects();
    //Deep traversal of the heap to identify the necessary scope of residual functions
    if (timingStats !== undefined) timingStats.deepTraversalTime = Date.now();
    let residualHeapVisitor = new ResidualHeapVisitor(this.realm, this.logger, this.modules);
    residualHeapVisitor.visitRoots();
    this.realm.wrapInGlobalEnv(() => this.realm.evaluateForEffects(() => {
      if (additionalFunctionValuesAndEffects.size) {
        for (let [functionValue, effects] of additionalFunctionValuesAndEffects.entries()) {
          let [r, g, ob, pb, co] = effects;
          // need to switch the application order of generators to ensure consistency
          // between visitor and serializer (a function should have only one associated
          // generator).
          let originalLength = g.length;
          let originalGenerator = this.realm.generator;
          this.realm.generator = g;
          // TODO: should we be ignoring the preludegenerator here?
          // TODO: does the emitter do the right thing here
          // TODO: this is an overapproximation of the objects used from the scope of
          // the additional function, try not to visit the original generator twice
          this.realm.applyEffects([r, originalGenerator, ob, pb, co]);
          residualHeapVisitor.visitRoots(functionValue);
          g.length = originalLength;
        }
      }
      return this.realm.intrinsics.undefined;
    }));
    if (this.logger.hasErrors()) return undefined;
    if (timingStats !== undefined) timingStats.deepTraversalTime = Date.now() - timingStats.deepTraversalTime;

    // Phase 2: Let's serialize the heap and generate code.
    // Serialize for the first time in order to gather reference counts
    let residualHeapValueIdentifiers = new ResidualHeapValueIdentifiers();

    if (this.options.inlineExpressions) {
      if (timingStats !== undefined) timingStats.referenceCountsTime = Date.now();
      residualHeapValueIdentifiers.initPass1();
      new ResidualHeapSerializer(
        this.realm,
        this.logger,
        this.modules,
        residualHeapValueIdentifiers,
        residualHeapVisitor.inspector,
        residualHeapVisitor.values,
        residualHeapVisitor.functionBindings,
        residualHeapVisitor.functionInfos,
        !!this.options.delayInitializations,
        residualHeapVisitor.referencedDeclaredValues,
        additionalFunctionValuesAndEffects
      ).serialize();
      if (this.logger.hasErrors()) return undefined;
      if (timingStats !== undefined) timingStats.referenceCountsTime = Date.now() - timingStats.referenceCountsTime;
      residualHeapValueIdentifiers.initPass2();
    }

    // Serialize for a second time, using reference counts to minimize number of generated identifiers
    if (timingStats !== undefined) timingStats.serializePassTime = Date.now();
    let residualHeapSerializer = new ResidualHeapSerializer(
      this.realm,
      this.logger,
      this.modules,
      residualHeapValueIdentifiers,
      residualHeapVisitor.inspector,
      residualHeapVisitor.values,
      residualHeapVisitor.functionBindings,
      residualHeapVisitor.functionInfos,
      !!this.options.delayInitializations,
      residualHeapVisitor.referencedDeclaredValues,
      additionalFunctionValuesAndEffects
    );

    let ast = residualHeapSerializer.serialize();
    let generated = generate(ast, { sourceMaps: sourceMaps }, (code: any));
    if (timingStats !== undefined) {
      timingStats.serializePassTime = Date.now() - timingStats.serializePassTime;
      timingStats.totalTime = Date.now() - timingStats.totalTime;
    }
    invariant(!this.logger.hasErrors());
    if (this.options.logStatistics) residualHeapSerializer.statistics.log();
    return {
      code: generated.code,
      map: generated.map,
      statistics: residualHeapSerializer.statistics,
      timingStats: timingStats,
    };
  }
}
