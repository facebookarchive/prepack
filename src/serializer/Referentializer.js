/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { DeclarativeEnvironmentRecord } from "../environment.js";
import type { SerializerOptions } from "../options.js";
import * as t from "@babel/types";
import generate from "@babel/generator";
import type { BabelNodeStatement, BabelNodeExpression, BabelNodeIdentifier } from "@babel/types";
import { NameGenerator } from "../utils/NameGenerator";
import invariant from "../invariant.js";
import type { ResidualFunctionBinding, ScopeBinding, FunctionInstance } from "./types.js";
import type { ReferentializationScope, Scope } from "./types.js";
import { SerializerStatistics } from "./statistics.js";
import { getOrDefault } from "./utils.js";
import { Realm } from "../realm.js";
import type { ResidualOptimizedFunctions } from "./ResidualOptimizedFunctions";

type ReferentializationState = {|
  capturedScopeInstanceIdx: number,
  capturedScopesArray: BabelNodeIdentifier,
  capturedScopeAccessFunctionId: BabelNodeIdentifier,
  serializedScopes: Map<DeclarativeEnvironmentRecord, ScopeBinding>,
|};

/*
 * This class helps fixup names in residual functions for variables that these
 * functions capture from parent scopes.
 * For each ReferentializationScope it creates a _get_scope_binding function
 * that contains the initialization for all of that scope's FunctionInstances
 * which will contain a switch statement with all the initializations.
 */
export class Referentializer {
  constructor(
    realm: Realm,
    options: SerializerOptions,
    scopeNameGenerator: NameGenerator,
    scopeBindingNameGenerator: NameGenerator,
    leakedNameGenerator: NameGenerator,
    residualOptimizedFunctions: ResidualOptimizedFunctions
  ) {
    this._options = options;
    this.scopeNameGenerator = scopeNameGenerator;
    this.scopeBindingNameGenerator = scopeBindingNameGenerator;

    this.referentializationState = new Map();
    this._leakedNameGenerator = leakedNameGenerator;
    this.realm = realm;

    this._residualOptimizedFunctions = residualOptimizedFunctions;
  }

  _options: SerializerOptions;
  scopeNameGenerator: NameGenerator;
  scopeBindingNameGenerator: NameGenerator;
  realm: Realm;

  _newCapturedScopeInstanceIdx: number;
  referentializationState: Map<ReferentializationScope, ReferentializationState>;
  _leakedNameGenerator: NameGenerator;
  _residualOptimizedFunctions: ResidualOptimizedFunctions;

  getStatistics(): SerializerStatistics {
    invariant(this.realm.statistics instanceof SerializerStatistics, "serialization requires SerializerStatistics");
    return this.realm.statistics;
  }

  _createReferentializationState(): ReferentializationState {
    return {
      capturedScopeInstanceIdx: 0,
      capturedScopesArray: t.identifier(this.scopeNameGenerator.generate("main")),
      capturedScopeAccessFunctionId: t.identifier(this.scopeBindingNameGenerator.generate("get_scope_binding")),
      serializedScopes: new Map(),
    };
  }

  _getReferentializationState(referentializationScope: ReferentializationScope): ReferentializationState {
    return getOrDefault(
      this.referentializationState,
      referentializationScope,
      this._createReferentializationState.bind(this)
    );
  }

  createLeakedIds(referentializationScope: ReferentializationScope): Array<BabelNodeStatement> {
    const leakedIds = [];
    const serializedScopes = this._getReferentializationState(referentializationScope).serializedScopes;
    for (const scopeBinding of serializedScopes.values()) leakedIds.push(...scopeBinding.leakedIds);
    if (leakedIds.length === 0) return [];
    return [t.variableDeclaration("var", leakedIds.map(id => t.variableDeclarator(id)))];
  }

  createCapturedScopesPrelude(referentializationScope: ReferentializationScope): Array<BabelNodeStatement> {
    let accessFunctionDeclaration = this._createCaptureScopeAccessFunction(referentializationScope);
    if (accessFunctionDeclaration === undefined) return [];
    return [accessFunctionDeclaration, this._createCapturedScopesArrayInitialization(referentializationScope)];
  }

  // Generate a shared function for accessing captured scope bindings.
  // TODO: skip generating this function if the captured scope is not shared by multiple residual functions.
  _createCaptureScopeAccessFunction(referentializationScope: ReferentializationScope): void | BabelNodeStatement {
    // One switch case for one scope.
    const cases = [];
    const serializedScopes = this._getReferentializationState(referentializationScope).serializedScopes;
    type InitializationCase = {|
      scopeIDs: Array<number>,
      value: BabelNodeExpression,
    |};
    const initializationCases: Map<string, InitializationCase> = new Map();
    for (const scopeBinding of serializedScopes.values()) {
      if (scopeBinding.initializationValues.length === 0) continue;
      const expr = t.arrayExpression((scopeBinding.initializationValues: any));
      const key = generate(expr, {}, "").code;
      if (!initializationCases.has(key)) {
        initializationCases.set(key, {
          scopeIDs: [scopeBinding.id],
          value: expr,
        });
      } else {
        const ic = initializationCases.get(key);
        invariant(ic);
        ic.scopeIDs.push(scopeBinding.id);
      }
    }
    if (initializationCases.size === 0) return undefined;

    const body = [];
    const selectorParam = t.identifier("__selector");
    const captured = t.identifier("__captured");
    const capturedScopesArray = this._getReferentializationState(referentializationScope).capturedScopesArray;
    const selectorExpression = t.memberExpression(capturedScopesArray, selectorParam, /*Indexer syntax*/ true);
    for (const ic of initializationCases.values()) {
      ic.scopeIDs.forEach((id, i) => {
        let consequent: Array<BabelNodeStatement> = [];
        if (i === ic.scopeIDs.length - 1) {
          consequent = [t.expressionStatement(t.assignmentExpression("=", captured, ic.value)), t.breakStatement()];
        }
        cases.push(t.switchCase(t.numericLiteral(id), consequent));
      });
    }
    // Default case.
    if (this.realm.invariantLevel >= 1) {
      cases.push(
        t.switchCase(null, [
          t.throwStatement(t.newExpression(t.identifier("Error"), [t.stringLiteral("Unknown scope selector")])),
        ])
      );
    }

    body.push(t.variableDeclaration("var", [t.variableDeclarator(captured)]));
    body.push(t.switchStatement(selectorParam, cases));
    body.push(t.expressionStatement(t.assignmentExpression("=", selectorExpression, captured)));
    body.push(t.returnStatement(captured));
    const factoryFunction = t.functionExpression(null, [selectorParam], t.blockStatement(body));
    const accessFunctionId = this._getReferentializationState(referentializationScope).capturedScopeAccessFunctionId;
    return t.variableDeclaration("var", [t.variableDeclarator(accessFunctionId, factoryFunction)]);
  }

  _getReferentializationScope(residualBinding: ResidualFunctionBinding): ReferentializationScope {
    if (residualBinding.potentialReferentializationScopes.has("GLOBAL")) return "GLOBAL";
    if (residualBinding.potentialReferentializationScopes.size > 1) {
      // Here we know potentialReferentializationScopes cannot contain "GLOBAL"; Set<FunctionValue> is
      // compatible with Set<FunctionValue | Generator>
      let scopes = ((residualBinding.potentialReferentializationScopes: any): Set<Scope>);
      let parentOptimizedFunction = this._residualOptimizedFunctions.tryGetOutermostOptimizedFunction(scopes);
      return parentOptimizedFunction || "GLOBAL";
    }
    for (let scope of residualBinding.potentialReferentializationScopes) return scope;
    invariant(false);
  }

  _getSerializedBindingScopeInstance(residualBinding: ResidualFunctionBinding): ScopeBinding {
    let declarativeEnvironmentRecord = residualBinding.declarativeEnvironmentRecord;
    invariant(declarativeEnvironmentRecord);

    let referentializationScope = this._getReferentializationScope(residualBinding);

    // figure out if this is accessed only from additional functions
    let refState: ReferentializationState = this._getReferentializationState(referentializationScope);
    let scope = refState.serializedScopes.get(declarativeEnvironmentRecord);
    if (!scope) {
      scope = {
        name: this.scopeNameGenerator.generate(),
        id: refState.capturedScopeInstanceIdx++,
        initializationValues: [],
        leakedIds: [],
        referentializationScope,
      };
      refState.serializedScopes.set(declarativeEnvironmentRecord, scope);
    }

    invariant(scope.referentializationScope === referentializationScope);
    invariant(!residualBinding.scope || residualBinding.scope === scope);
    residualBinding.scope = scope;
    return scope;
  }

  getReferentializedScopeInitialization(
    scope: ScopeBinding,
    scopeName: BabelNodeExpression
  ): Array<BabelNodeStatement> {
    const capturedScope = scope.capturedScope;
    invariant(capturedScope);
    const state = this._getReferentializationState(scope.referentializationScope);
    const funcName = state.capturedScopeAccessFunctionId;
    const scopeArray = state.capturedScopesArray;
    // First get scope array entry and check if it's already initialized.
    // Only if not yet, then call the initialization function.
    const init = t.logicalExpression(
      "||",
      t.memberExpression(scopeArray, scopeName, true),
      t.callExpression(funcName, [scopeName])
    );
    return [t.variableDeclaration("var", [t.variableDeclarator(t.identifier(capturedScope), init)])];
  }

  referentializeLeakedBinding(residualBinding: ResidualFunctionBinding): void {
    invariant(residualBinding.hasLeaked);
    // When simpleClosures is enabled, then space for captured mutable bindings is allocated upfront.
    let serializedBindingId = t.identifier(this._leakedNameGenerator.generate(residualBinding.name));
    let scope = this._getSerializedBindingScopeInstance(residualBinding);
    scope.leakedIds.push(serializedBindingId);
    residualBinding.serializedValue = residualBinding.serializedUnscopedLocation = serializedBindingId;

    this.getStatistics().referentialized++;
  }

  referentializeModifiedBinding(residualBinding: ResidualFunctionBinding): void {
    invariant(residualBinding.modified);

    // Space for captured mutable bindings is allocated lazily.
    let scope = this._getSerializedBindingScopeInstance(residualBinding);
    let capturedScope = "__captured" + scope.name;
    // Save the serialized value for initialization at the top of
    // the factory.
    // This can serialize more variables than are necessary to execute
    // the function because every function serializes every
    // modified variable of its parent scope. In some cases it could be
    // an improvement to split these variables into multiple
    // scopes.
    const variableIndexInScope = scope.initializationValues.length;
    const indexExpression = t.numericLiteral(variableIndexInScope);
    invariant(residualBinding.serializedValue);
    scope.initializationValues.push(residualBinding.serializedValue);
    scope.capturedScope = capturedScope;

    // Replace binding usage with scope references

    // The rewritten .serializedValue refers to a local capturedScope variable
    // which is only accessible from within residual functions where code
    // to create this variable is emitted.
    residualBinding.serializedValue = t.memberExpression(
      t.identifier(capturedScope),
      indexExpression,
      true // Array style access.
    );

    // .serializedUnscopedLocation is initialized with a more general expressions
    // that can be used outside of residual functions.
    // TODO: Creating these expressions just in case looks expensive. Measure, and potentially only create lazily.
    const state = this._getReferentializationState(scope.referentializationScope);
    const funcName = state.capturedScopeAccessFunctionId;
    const scopeArray = state.capturedScopesArray;
    // First get scope array entry and check if it's already initialized.
    // Only if not yet, then call the initialization function.
    const scopeName = t.numericLiteral(scope.id);
    const capturedScopeExpression = t.logicalExpression(
      "||",
      t.memberExpression(scopeArray, scopeName, true),
      t.callExpression(funcName, [scopeName])
    );
    residualBinding.serializedUnscopedLocation = t.memberExpression(
      capturedScopeExpression,
      indexExpression,
      true // Array style access.
    );

    this.getStatistics().referentialized++;
  }

  // Cleans all scopes between passes of the serializer
  cleanInstance(instance: FunctionInstance): void {
    instance.initializationStatements = [];
    for (let b of ((instance: any): FunctionInstance).residualFunctionBindings.values()) {
      let binding = ((b: any): ResidualFunctionBinding);
      if (binding.referentialized && binding.declarativeEnvironmentRecord) {
        let declarativeEnvironmentRecord = binding.declarativeEnvironmentRecord;
        let referentializationScope = this._getReferentializationScope(binding);

        let refState = this.referentializationState.get(referentializationScope);
        if (refState) {
          let scope = refState.serializedScopes.get(declarativeEnvironmentRecord);
          if (scope) {
            scope.initializationValues = [];
            scope.leakedIds = [];
          }
        }
      }
      delete binding.serializedValue;
    }
  }

  referentialize(instance: FunctionInstance): void {
    let residualBindings = instance.residualFunctionBindings;

    for (let residualBinding of residualBindings.values()) {
      if (residualBinding === undefined) continue;
      if (residualBinding.modified) {
        // Initialize captured scope at function call instead of globally
        if (!residualBinding.declarativeEnvironmentRecord) residualBinding.referentialized = true;
        if (!residualBinding.referentialized) {
          if (!residualBinding.hasLeaked) this._getSerializedBindingScopeInstance(residualBinding);
          residualBinding.referentialized = true;
        }

        invariant(residualBinding.referentialized);
        if (residualBinding.declarativeEnvironmentRecord && residualBinding.scope) {
          instance.scopeInstances.set(residualBinding.scope.name, residualBinding.scope);
        }
      }
    }
  }

  _createCapturedScopesArrayInitialization(referentializationScope: ReferentializationScope): BabelNodeStatement {
    return t.variableDeclaration("var", [
      t.variableDeclarator(
        this._getReferentializationState(referentializationScope).capturedScopesArray,
        t.newExpression(t.identifier("Array"), [
          t.numericLiteral(this._getReferentializationState(referentializationScope).capturedScopeInstanceIdx),
        ])
      ),
    ]);
  }
}
