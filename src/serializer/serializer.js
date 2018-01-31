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
import traverseFast from "../utils/traverse-fast.js";
import invariant from "../invariant.js";
import type { SerializerOptions } from "../options.js";
import { TimingStatistics, SerializerStatistics, ReactStatistics } from "./types.js";
import type { ReactSerializerState, SerializedResult } from "./types.js";
import { Functions } from "./functions.js";
import { Logger } from "../utils/logger.js";
import { Modules } from "../utils/modules.js";
import { LoggingTracer } from "./LoggingTracer.js";
import { ResidualHeapVisitor } from "./ResidualHeapVisitor.js";
import { ResidualHeapSerializer } from "./ResidualHeapSerializer.js";
import { ResidualHeapValueIdentifiers } from "./ResidualHeapValueIdentifiers.js";
import { LazyObjectsSerializer } from "./LazyObjectsSerializer.js";
import * as t from "babel-types";
import { ResidualHeapRefCounter } from "./ResidualHeapRefCounter";
import { ResidualHeapGraphGenerator } from "./ResidualHeapGraphGenerator";

export class Serializer {
  constructor(realm: Realm, serializerOptions: SerializerOptions = {}) {
    invariant(realm.useAbstractInterpretation);
    // Start tracking mutations
    realm.generator = new Generator(realm, "main");

    this.realm = realm;
    this.logger = new Logger(this.realm, !!serializerOptions.internalDebug);
    this.statistics = new SerializerStatistics();
    this.modules = new Modules(
      this.realm,
      this.logger,
      this.statistics,
      !!serializerOptions.logModules,
      !!serializerOptions.delayUnsupportedRequires,
      !!serializerOptions.accelerateUnsupportedRequires
    );
    this.functions = new Functions(this.realm, serializerOptions.additionalFunctions, this.modules.moduleTracer);
    if (serializerOptions.trace) this.realm.tracers.push(new LoggingTracer(this.realm));

    this.options = serializerOptions;
    this.react = {
      usedReactElementKeys: new Set(),
    };
  }

  realm: Realm;
  functions: Functions;
  logger: Logger;
  modules: Modules;
  options: SerializerOptions;
  statistics: SerializerStatistics;
  react: ReactSerializerState;

  _execute(sources: Array<SourceFile>, sourceMaps?: boolean = false): { [string]: string } {
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

  init(sources: Array<SourceFile>, sourceMaps?: boolean = false): void | SerializedResult {
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
    this.functions.checkThatFunctionsAreIndependent();
    let reactStatistics = null;
    if (this.realm.react.enabled) {
      reactStatistics = new ReactStatistics();
      this.functions.checkRootReactComponentTrees(reactStatistics, this.react);
    }

    if (this.options.initializeMoreModules) {
      if (timingStats !== undefined) timingStats.initializeMoreModulesTime = Date.now();
      this.modules.initializeMoreModules();
      if (this.logger.hasErrors()) return undefined;
      if (timingStats !== undefined)
        timingStats.initializeMoreModulesTime = Date.now() - timingStats.initializeMoreModulesTime;
    }

    let additionalFunctionValuesAndEffects = this.functions.getAdditionalFunctionValuesToEffects();
    for (let [functionValue, effectsAndTransforms] of additionalFunctionValuesAndEffects) {
      // Need to do this fixup because otherwise we will skip over this function's
      // generator in the _getTarget scope lookup
      let generator = effectsAndTransforms.effects[1];
      generator.parent = functionValue.parent;
      functionValue.parent = generator;
    }

    return this.realm.evaluateWithoutLeakLogic(() => {
      // Deep traversal of the heap to identify the necessary scope of residual functions
      if (timingStats !== undefined) timingStats.deepTraversalTime = Date.now();
      let residualHeapVisitor = new ResidualHeapVisitor(
        this.realm,
        this.logger,
        this.modules,
        additionalFunctionValuesAndEffects
      );
      residualHeapVisitor.visitRoots(true);
      if (this.logger.hasErrors()) return undefined;
      if (timingStats !== undefined) timingStats.deepTraversalTime = Date.now() - timingStats.deepTraversalTime;

      const realmPreludeGenerator = this.realm.preludeGenerator;
      invariant(realmPreludeGenerator);
      const residualHeapValueIdentifiers = new ResidualHeapValueIdentifiers(
        residualHeapVisitor.values.keys(),
        realmPreludeGenerator
      );

      let heapGraph;
      if (this.options.heapGraphFormat) {
        const heapRefCounter = new ResidualHeapRefCounter(
          this.realm,
          this.logger,
          this.modules,
          additionalFunctionValuesAndEffects
        );
        heapRefCounter.visitRoots();

        const heapGraphGenerator = new ResidualHeapGraphGenerator(
          this.realm,
          this.logger,
          this.modules,
          additionalFunctionValuesAndEffects,
          residualHeapValueIdentifiers,
          heapRefCounter.getResult()
        );
        heapGraphGenerator.visitRoots();
        invariant(this.options.heapGraphFormat);
        heapGraph = heapGraphGenerator.generateResult(this.options.heapGraphFormat);
      }

      // Phase 2: Let's serialize the heap and generate code.
      // Serialize for the first time in order to gather reference counts

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
          residualHeapVisitor.functionInstances,
          residualHeapVisitor.classMethodInstances,
          residualHeapVisitor.functionInfos,
          this.options,
          residualHeapVisitor.referencedDeclaredValues,
          additionalFunctionValuesAndEffects,
          residualHeapVisitor.additionalFunctionValueInfos,
          residualHeapVisitor.declarativeEnvironmentRecordsBindings,
          this.statistics,
          this.react
        ).serialize();
        if (this.logger.hasErrors()) return undefined;
        if (timingStats !== undefined) timingStats.referenceCountsTime = Date.now() - timingStats.referenceCountsTime;
        residualHeapValueIdentifiers.initPass2();
      }

      // Serialize for a second time, using reference counts to minimize number of generated identifiers
      if (timingStats !== undefined) timingStats.serializePassTime = Date.now();
      const TargetSerializer = this.options.lazyObjectsRuntime != null ? LazyObjectsSerializer : ResidualHeapSerializer;
      let residualHeapSerializer = new TargetSerializer(
        this.realm,
        this.logger,
        this.modules,
        residualHeapValueIdentifiers,
        residualHeapVisitor.inspector,
        residualHeapVisitor.values,
        residualHeapVisitor.functionInstances,
        residualHeapVisitor.classMethodInstances,
        residualHeapVisitor.functionInfos,
        this.options,
        residualHeapVisitor.referencedDeclaredValues,
        additionalFunctionValuesAndEffects,
        residualHeapVisitor.additionalFunctionValueInfos,
        residualHeapVisitor.declarativeEnvironmentRecordsBindings,
        this.statistics,
        this.react
      );

      let ast = residualHeapSerializer.serialize();

      // the signature for generate is not complete, hence the any
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
        reactStatistics,
        statistics: residualHeapSerializer.statistics,
        timingStats: timingStats,
        heapGraph,
      };
    });
  }
}
