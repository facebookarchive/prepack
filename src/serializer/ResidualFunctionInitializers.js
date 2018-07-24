/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { FunctionValue, Value } from "../values/index.js";
import * as t from "@babel/types";
import type { BabelNodeStatement } from "@babel/types";
import { NameGenerator } from "../utils/NameGenerator.js";
import traverseFast from "../utils/traverse-fast.js";
import invariant from "../invariant.js";
import { voidExpression, nullExpression } from "../utils/babelhelpers.js";
import type { LocationService, SerializedBody } from "./types.js";
import { factorifyObjects } from "./factorify.js";

// This class manages information about values
// which are only referenced by residual functions,
// and it provides the ability to generate initialization code for those values that
// can be placed into the residual functions.
export class ResidualFunctionInitializers {
  constructor(locationService: LocationService) {
    this.functionInitializerInfos = new Map();
    this.initializers = new Map();
    this.sharedInitializers = new Map();
    this.locationService = locationService;
  }

  // ownId: uid of the FunctionValue, initializer ids are strings of sorted lists of FunctionValues referencing the value
  functionInitializerInfos: Map<FunctionValue, { ownId: string, initializerIds: Set<string> }>;
  initializers: Map<string, { id: string, order: number, body: SerializedBody, values: Array<Value> }>;
  sharedInitializers: Map<string, BabelNodeStatement>;
  locationService: LocationService;

  registerValueOnlyReferencedByResidualFunctions(functionValues: Array<FunctionValue>, val: Value): SerializedBody {
    invariant(functionValues.length >= 1);
    let infos = [];
    for (let functionValue of functionValues) {
      let info = this.functionInitializerInfos.get(functionValue);
      if (info === undefined)
        this.functionInitializerInfos.set(
          functionValue,
          (info = { ownId: this.functionInitializerInfos.size.toString(), initializerIds: new Set() })
        );
      infos.push(info);
    }
    let id = infos
      .map(info => info.ownId)
      .sort()
      .join();
    for (let info of infos) info.initializerIds.add(id);
    let initializer = this.initializers.get(id);
    if (initializer === undefined)
      this.initializers.set(
        id,
        (initializer = {
          id,
          order: infos.length,
          values: [],
          body: { type: "DelayInitializations", parentBody: undefined, entries: [], done: false },
        })
      );
    initializer.values.push(val);
    return initializer.body;
  }

  scrubFunctionInitializers(): void {
    // Deleting trivial entries in order to avoid creating empty initialization functions that serve no purpose.
    for (let initializer of this.initializers.values())
      if (initializer.body.entries.length === 0) this.initializers.delete(initializer.id);
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

  _conditionalInitialization(
    containingAdditionalFunction: void | FunctionValue,
    initializedValues: Array<Value>,
    initializationStatements: Array<BabelNodeStatement>
  ): BabelNodeStatement {
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
      // function declarations get hoisted, so let's not use their initialization state as a marker
      if (!value.mightBeUndefined() && !(value instanceof FunctionValue)) {
        location = this.locationService.getLocation(value);
        if (location !== undefined) break;
      }
    }
    if (location === undefined) {
      // Second, if we didn't find a non-undefined value, let's make one up.
      // It will transition from `undefined` to `null`.
      location = this.locationService.createLocation(containingAdditionalFunction);
      initializationStatements.unshift(t.expressionStatement(t.assignmentExpression("=", location, nullExpression)));
    }
    return t.ifStatement(
      t.binaryExpression("===", location, voidExpression),
      t.blockStatement(initializationStatements)
    );
  }

  hasInitializerStatement(functionValue: FunctionValue): boolean {
    return !!this.functionInitializerInfos.get(functionValue);
  }

  factorifyInitializers(nameGenerator: NameGenerator): void {
    for (const initializer of this.initializers.values()) {
      factorifyObjects(initializer.body.entries, nameGenerator);
    }
  }

  getInitializerStatement(functionValue: FunctionValue): void | BabelNodeStatement {
    let initializerInfo = this.functionInitializerInfos.get(functionValue);
    if (initializerInfo === undefined) return undefined;
    let containingAdditionalFunction = this.locationService.getContainingAdditionalFunction(functionValue);

    invariant(initializerInfo.initializerIds.size > 0);
    let ownInitializer = this.initializers.get(initializerInfo.ownId);
    let initializedValues;
    let initializationStatements = [];
    let initializers = [];
    for (let initializerId of initializerInfo.initializerIds) {
      let initializer = this.initializers.get(initializerId);
      invariant(initializer !== undefined);
      invariant(initializer.body.entries.length > 0);
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
        initializationStatements = initializationStatements.concat(initializer.body.entries);
      } else {
        let ast = this.sharedInitializers.get(initializer.id);
        if (ast === undefined) {
          ast = this._conditionalInitialization(
            containingAdditionalFunction,
            initializer.values,
            initializer.body.entries
          );
          // We inline compact initializers, as calling a function would introduce too much
          // overhead. To determine if an initializer is compact, we count the number of
          // nodes in the AST, and check if it exceeds a certain threshold.
          // TODO #885: Study in more detail which threshold is the best compromise in terms of
          // code size and performance.
          let count = 0;
          traverseFast(t.file(t.program([ast])), node => {
            count++;
            return false;
          });
          if (count > 24) {
            let id = this.locationService.createFunction(containingAdditionalFunction, [ast]);
            ast = t.expressionStatement(t.callExpression(id, []));
          }
          this.sharedInitializers.set(initializer.id, ast);
        }
        initializationStatements.push(ast);
      }
    }

    return this._conditionalInitialization(
      containingAdditionalFunction,
      initializedValues || [],
      initializationStatements
    );
  }
}
