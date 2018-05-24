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
import * as t from "babel-types";
import generate from "babel-generator";
import type { BabelNodeStatement, BabelNodeExpression, BabelNodeIdentifier } from "babel-types";
import { NameGenerator } from "../utils/generator.js";
import invariant from "../invariant.js";
import type { ResidualFunctionBinding, ScopeBinding, FunctionInstance } from "./types.js";
import { type ReferentializationScope } from "./types.js";
import { SerializerStatistics } from "./statistics.js";
import { getOrDefault } from "./utils.js";
import { Realm } from "../realm.js";

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
    scopeBindingNameGenerator: NameGenerator
  ) {
    this._options = options;
    this.scopeNameGenerator = scopeNameGenerator;
    this.scopeBindingNameGenerator = scopeBindingNameGenerator;

    this.referentializationState = new Map();
    this.realm = realm;
  }

  _options: SerializerOptions;
  scopeNameGenerator: NameGenerator;
  scopeBindingNameGenerator: NameGenerator;
  realm: Realm;

  _newCapturedScopeInstanceIdx: number;
  referentializationState: Map<ReferentializationScope, ReferentializationState>;

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

  // Generate a shared function for accessing captured scope bindings.
  // TODO: skip generating this function if the captured scope is not shared by multiple residual functions.
  createCaptureScopeAccessFunction(referentializationScope: ReferentializationScope): BabelNodeStatement {
    const body = [];
    const selectorParam = t.identifier("__selector");
    const captured = t.identifier("__captured");
    const capturedScopesArray = this._getReferentializationState(referentializationScope).capturedScopesArray;
    const selectorExpression = t.memberExpression(capturedScopesArray, selectorParam, /*Indexer syntax*/ true);

    // One switch case for one scope.
    const cases = [];
    const serializedScopes = this._getReferentializationState(referentializationScope).serializedScopes;
    type InitializationCase = {|
      scopeIDs: Array<number>,
      value: BabelNodeExpression,
    |};
    const initializationCases: Map<string, InitializationCase> = new Map();
    for (const scopeBinding of serializedScopes.values()) {
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
    cases.push(
      t.switchCase(null, [
        t.throwStatement(t.newExpression(t.identifier("Error"), [t.stringLiteral("Unknown scope selector")])),
      ])
    );

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
      // TODO Revisit for nested optimized functions.
      return "GLOBAL";
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

  referentializeBinding(residualBinding: ResidualFunctionBinding, name: string, instance: FunctionInstance): void {
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
    invariant(residualBinding.serializedValue);
    scope.initializationValues.push(residualBinding.serializedValue);
    scope.capturedScope = capturedScope;

    // Replace binding usage with scope references
    residualBinding.serializedValue = t.memberExpression(
      t.identifier(capturedScope),
      t.numericLiteral(variableIndexInScope),
      true // Array style access.
    );

    this.getStatistics().referentialized++;
  }

  // Cleans all scopes between passes of the serializer
  cleanInstance(instance: FunctionInstance) {
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
          this._getSerializedBindingScopeInstance(residualBinding);
          residualBinding.referentialized = true;
        }

        invariant(residualBinding.referentialized);
        if (residualBinding.declarativeEnvironmentRecord && residualBinding.scope) {
          instance.scopeInstances.set(residualBinding.scope.name, residualBinding.scope);
        }
      }
    }
  }

  createCapturedScopesArrayInitialization(referentializationScope: ReferentializationScope): BabelNodeStatement {
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
