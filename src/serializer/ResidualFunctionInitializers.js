/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { FunctionValue, Value } from "../values/index.js";
import * as t from "babel-types";
import type { BabelNodeStatement, BabelNodeIdentifier } from "babel-types";
import { NameGenerator } from "../utils/generator.js";
import traverse from "babel-traverse";
import invariant from "../invariant.js";
import { voidExpression, nullExpression } from "../utils/internalizer.js";

export type LocationService = {
  getLocation: Value => void | BabelNodeIdentifier,
  createLocation: () => BabelNodeIdentifier
};

// This class manages information about values
// which are only referenced by residual functions,
// and it provides the ability to generate initialization code for those values that
// can be placed into the residual functions.
export class ResidualFunctionInitializers {
  constructor(
    locationService: LocationService,
    prelude: Array<BabelNodeStatement>,
    initializerNameGenerator: NameGenerator
  ) {
    this.functionInitializerInfos = new Map();
    this.initializers = new Map();
    this.sharedInitializers = new Map();
    this.locationService = locationService;
    this.initializerNameGenerator = initializerNameGenerator;
    this.prelude = prelude;
  }

  functionInitializerInfos: Map<FunctionValue, { ownId: string, initializerIds: Set<string> }>;
  initializers: Map<string, { id: string, order: number, body: Array<BabelNodeStatement>, values: Array<Value> }>;
  sharedInitializers: Map<string, BabelNodeStatement>;
  locationService: LocationService;
  prelude: Array<BabelNodeStatement>;
  initializerNameGenerator: NameGenerator;

  registerValueOnlyReferencedByResidualFunctions(functionValues: Array<FunctionValue>, val: Value): Array<BabelNodeStatement> {
    invariant(functionValues.length >= 1);
    let infos = [];
    for (let functionValue of functionValues) {
      let info = this.functionInitializerInfos.get(functionValue);
      if (info === undefined) this.functionInitializerInfos.set(functionValue, info = { ownId: this.functionInitializerInfos.size.toString(), initializerIds: new Set() });
      infos.push(info);
    }
    let id = infos.map(info => info.ownId).sort().join();
    for (let info of infos) info.initializerIds.add(id);
    let initializer = this.initializers.get(id);
    if (initializer === undefined) this.initializers.set(id, initializer = { id, order: infos.length, values: [], body: [] });
    initializer.values.push(val);
    return initializer.body;
  }

  scrubFunctionInitializers() {
    // Deleting trivial entries in order to avoid creating empty initialization functions that serve no purpose.
    for (let initializer of this.initializers.values())
      if (initializer.body.length === 0) this.initializers.delete(initializer.id);
    for (let [functionValue, info] of this.functionInitializerInfos) {
      for (let id of info.initializerIds) {
        let initializer = this.initializers.get(id);
        if (initializer === undefined) {
          info.initializerIds.delete(id);
        }
      }
      if (info.initializerIds.size === 0) this.functionInitializerInfos.delete(functionValue);
    }
  }

  _conditionalInitialization(initializedValues: Array<Value>, initializationStatements: Array<BabelNodeStatement>): BabelNodeStatement  {
    if (initializationStatements.length === 1 && t.isIfStatement(initializationStatements[0])) {
      return initializationStatements[0];
    }

    // We have some initialization code, and it should only get executed once,
    // so we are going to guard it.
    // First, let's see if one of the initialized values is guaranteed to not
    // be undefined after initialization. In that case, we can use that state-change
    // to figure out if initialization needs to run.
    let location;
    for (let value of initializedValues) {
      if (!value.mightBeUndefined()) {
        location = this.locationService.getLocation(value);
        if (location !== undefined) break;
      }
    }
    if (location === undefined) {
      // Second, if we didn't find a non-undefined value, let's make one up.
      // It will transition from `undefined` to `null`.
      location = this.locationService.createLocation();
      initializationStatements.unshift(
        t.expressionStatement(
          t.assignmentExpression(
            "=",
            location,
            nullExpression
          )
        )
      );
    }
    return t.ifStatement(
      t.binaryExpression("===", location, voidExpression),
      t.blockStatement(initializationStatements));
  }

  hasInitializerStatement(functionValue: FunctionValue): boolean {
    return !!this.functionInitializerInfos.get(functionValue);
  }

  getInitializerStatement(functionValue: FunctionValue): void | BabelNodeStatement {
    let initializerInfo = this.functionInitializerInfos.get(functionValue);
    if (initializerInfo === undefined) return undefined;

    invariant(initializerInfo.initializerIds.size > 0);
    let ownInitializer = this.initializers.get(initializerInfo.ownId);
    let initializedValues;
    let initializationStatements = [];
    let initializers = [];
    for (let initializerId of initializerInfo.initializerIds) {
      let initializer = this.initializers.get(initializerId);
      invariant(initializer !== undefined);
      invariant(initializer.body.length > 0);
      initializers.push(initializer);
    }
    // Sorting initializers by the number of scopes they are required by.
    // Note that the scope sets form a lattice, and this sorting effectively
    // ensures that value initializers that depend on other value initializers
    // get called in the right order.
    initializers.sort((i, j) => j.order - i.order);
    for (let initializer of initializers) {
      if (initializerInfo.initializerIds.size === 1 || initializer === ownInitializer) {
        initializedValues = initializer.values;
      }
      if (initializer === ownInitializer) {
        initializationStatements = initializationStatements.concat(initializer.body);
      } else {
        let ast = this.sharedInitializers.get(initializer.id);
        if (ast === undefined) {
          ast = this._conditionalInitialization(initializer.values, initializer.body);
          // We inline compact initializers, as calling a function would introduce too much
          // overhead. To determine if an initializer is compact, we count the number of
          // nodes in the AST, and check if it exceeds a certain threshold.
          // TODO: Study in more detail which threshold is the best compromise in terms of
          // code size and performance.
          let count = 0;
          traverse(t.file(t.program([ast])), {
            enter(path) {
              count++;
            }
          }, null, {});
          if (count > 24) {
            let id = t.identifier(this.initializerNameGenerator.generate());
            this.prelude.push(t.functionDeclaration(id, [], t.blockStatement([ast])));
            ast = t.expressionStatement(t.callExpression(id, []));
          }
          this.sharedInitializers.set(initializer.id, ast);
        }
        initializationStatements.push(ast);
      }
    }

    return this._conditionalInitialization(initializedValues || [], initializationStatements);
  }
}
