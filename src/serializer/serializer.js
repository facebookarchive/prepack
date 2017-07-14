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
import type { SourceFile } from "../types.js";
import { Completion } from "../completions.js";
import { Value } from "../values/index.js";
import { Generator } from "../utils/generator.js";
import generate from "babel-generator";
import type SourceMap from "babel-generator";
// import { transform } from "babel-core";
import traverse from "babel-traverse";
import invariant from "../invariant.js";
import type { SerializerOptions } from "../options.js";
import { TimingStatistics, SerializerStatistics } from "./types.js";
import { IdentifierCollector } from "./visitors.js";
import { Logger } from "./logger.js";
import { Modules } from "./modules.js";
import { LoggingTracer } from "./LoggingTracer.js";
import { ResidualHeapVisitor } from "./ResidualHeapVisitor.js";
import { ResidualHeapSerializer } from "./ResidualHeapSerializer.js";

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
    if (serializerOptions.trace) this.realm.tracers.push(new LoggingTracer(this.realm));

    this.options = serializerOptions;
  }

  realm: Realm;
  logger: Logger;
  modules: Modules;
  options: SerializerOptions;

  _execute(filename: string, code: string, map: string, onError: void | ((Realm, Value) => void)) {
    let realm = this.realm;
    let res = realm.$GlobalEnv.execute(code, filename, map, "script", ast => {
      let realmPreludeGenerator = realm.preludeGenerator;
      invariant(realmPreludeGenerator);
      traverse(ast, IdentifierCollector, null, realmPreludeGenerator.nameGenerator.forbiddenNames);
    });

    if (res instanceof Completion) {
      let context = new ExecutionContext();
      realm.pushContext(context);
      try {
        if (onError) {
          onError(realm, res.value);
        }
        this.logger.logCompletion(res);
      } finally {
        realm.popContext(context);
      }
    }
  }

  init(
    sources: Array<SourceFile>,
    sourceMaps?: boolean = false,
    onError?: (Realm, Value) => void
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
    let code = {};
    for (let source of sources) {
      this._execute(source.filePath, source.fileContents, source.sourceMapContents || "", onError);
      code[source.filePath] = source.fileContents;
    }
    if (timingStats !== undefined) timingStats.globalCodeTime = Date.now() - timingStats.globalCodeTime;
    if (this.logger.hasErrors()) return undefined;
    if (this.options.initializeMoreModules) {
      if (timingStats !== undefined) timingStats.initializeMoreModulesTime = Date.now();
      this.modules.initializeMoreModules();
      if (this.logger.hasErrors()) return undefined;
      if (timingStats !== undefined)
        timingStats.initializeMoreModulesTime = Date.now() - timingStats.initializeMoreModulesTime;
    }

    //Deep traversal of the heap to identify the necessary scope of residual functions

    if (timingStats !== undefined) timingStats.deepTraversalTime = Date.now();
    let residualHeapVisitor = new ResidualHeapVisitor(this.realm, this.logger, this.modules);
    residualHeapVisitor.visitRoots();
    if (this.logger.hasErrors()) return undefined;
    if (timingStats !== undefined) timingStats.deepTraversalTime = Date.now() - timingStats.deepTraversalTime;

    // Phase 2: Let's serialize the heap and generate code.
    // Serialize for the first time in order to gather reference counts
    let valToRefCount;
    if (!this.options.singlePass) {
      if (timingStats !== undefined) timingStats.referenceCountsTime = Date.now();
      valToRefCount = new Map();
      new ResidualHeapSerializer(
        this.realm,
        this.logger,
        this.modules,
        /*collectValToRefCountOnly*/ true,
        valToRefCount,
        residualHeapVisitor.inspector,
        residualHeapVisitor.values,
        residualHeapVisitor.functionBindings,
        residualHeapVisitor.functionInfos
      ).serialize();
      if (this.logger.hasErrors()) return undefined;
      if (timingStats !== undefined) timingStats.referenceCountsTime = Date.now() - timingStats.referenceCountsTime;
    }

    // Serialize for a second time, using reference counts to minimize number of generated identifiers
    if (timingStats !== undefined) timingStats.serializePassTime = Date.now();

    let residualHeapSerializer = new ResidualHeapSerializer(
      this.realm,
      this.logger,
      this.modules,
      /*collectValToRefCountOnly*/ false,
      valToRefCount,
      residualHeapVisitor.inspector,
      residualHeapVisitor.values,
      residualHeapVisitor.functionBindings,
      residualHeapVisitor.functionInfos
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
