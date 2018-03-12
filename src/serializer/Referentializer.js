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
import { FatalError, CompilerDiagnostic } from "../errors.js";
import { FunctionValue } from "../values/index.js";
import type { SerializerOptions } from "../options.js";
import * as t from "babel-types";
import type { BabelNodeStatement, BabelNodeIdentifier } from "babel-types";
import { NameGenerator } from "../utils/generator.js";
import invariant from "../invariant.js";
import type { ResidualFunctionBinding, ScopeBinding, FunctionInstance } from "./types.js";
import { SerializerStatistics } from "./types.js";
import { getOrDefault } from "./utils.js";
import { Realm } from "../realm.js";

// Each of these will correspond to a different preludeGenerator and thus will
// have different values available for initialization. FunctionValues should
// only be additional functions.
export type ReferentializationScope = FunctionValue | "GLOBAL";

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
    referentializedNameGenerator: NameGenerator,
    statistics: SerializerStatistics
  ) {
    this._options = options;
    this.scopeNameGenerator = scopeNameGenerator;
    this.statistics = statistics;

    this.referentializationState = new Map();
    this._referentializedNameGenerator = referentializedNameGenerator;
    this.realm = realm;
  }

  _options: SerializerOptions;
  scopeNameGenerator: NameGenerator;
  statistics: SerializerStatistics;
  realm: Realm;

  _newCapturedScopeInstanceIdx: number;
  referentializationState: Map<ReferentializationScope, ReferentializationState>;
  _referentializedNameGenerator: NameGenerator;

  _createReferentializationState(): ReferentializationState {
    return {
      capturedScopeInstanceIdx: 0,
      capturedScopesArray: t.identifier(this.scopeNameGenerator.generate("main")),
      capturedScopeAccessFunctionId: t.identifier(this.scopeNameGenerator.generate("get_scope_binding")),
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
    for (const scopeBinding of serializedScopes.values()) {
      const scopeObjectExpression = t.arrayExpression((scopeBinding.initializationValues: any));
      cases.push(
        t.switchCase(t.numericLiteral(scopeBinding.id), [
          t.expressionStatement(t.assignmentExpression("=", captured, scopeObjectExpression)),
          t.breakStatement(),
        ])
      );
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

  _getSerializedBindingScopeInstance(residualBinding: ResidualFunctionBinding): ScopeBinding {
    let declarativeEnvironmentRecord = residualBinding.declarativeEnvironmentRecord;
    let referentializationScope = residualBinding.referencedOnlyFromAdditionalFunctions || "GLOBAL";
    invariant(declarativeEnvironmentRecord);

    // figure out if this is accessed only from additional functions
    let serializedScopes = this._getReferentializationState(referentializationScope).serializedScopes;
    let scope = serializedScopes.get(declarativeEnvironmentRecord);
    if (!scope) {
      let refState: ReferentializationState = this._getReferentializationState(referentializationScope);
      scope = {
        name: this.scopeNameGenerator.generate(),
        id: refState.capturedScopeInstanceIdx++,
        initializationValues: [],
        containingAdditionalFunction: residualBinding.referencedOnlyFromAdditionalFunctions,
      };
      serializedScopes.set(declarativeEnvironmentRecord, scope);
    }

    invariant(!residualBinding.scope || residualBinding.scope === scope);
    residualBinding.scope = scope;
    return scope;
  }

  getReferentializedScopeInitialization(scope: ScopeBinding) {
    const capturedScope = scope.capturedScope;
    invariant(capturedScope);
    const state = this._getReferentializationState(scope.containingAdditionalFunction || "GLOBAL");
    const funcName = state.capturedScopeAccessFunctionId;
    const scopeArray = state.capturedScopesArray;
    const scopeName = t.identifier(scope.name);
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
    if (this._options.simpleClosures) {
      // When simpleClosures is enabled, then space for captured mutable bindings is allocated upfront.
      let serializedBindingId = t.identifier(this._referentializedNameGenerator.generate(name));
      let serializedValue = residualBinding.serializedValue;
      invariant(serializedValue);
      let declar = t.variableDeclaration("var", [t.variableDeclarator(serializedBindingId, serializedValue)]);
      instance.initializationStatements.push(declar);
      residualBinding.serializedValue = serializedBindingId;
    } else {
      // When simpleClosures is not enabled, then space for captured mutable bindings is allocated lazily.
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
    }

    this.statistics.referentialized++;
  }

  // Cleans all scopes between passes of the serializer
  cleanInstance(instance: FunctionInstance) {
    instance.initializationStatements = [];
    for (let b of ((instance: any): FunctionInstance).residualFunctionBindings.values()) {
      let binding = ((b: any): ResidualFunctionBinding);
      if (binding.referentialized && binding.declarativeEnvironmentRecord) {
        let declarativeEnvironmentRecord = binding.declarativeEnvironmentRecord;
        let referentializationScope = binding.referencedOnlyFromAdditionalFunctions || "GLOBAL";

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

  referentialize(
    unbound: Set<string>,
    instances: Array<FunctionInstance>,
    shouldReferentializeInstanceFn: FunctionInstance => boolean
  ): void {
    for (let instance of instances) {
      let residualBindings = instance.residualFunctionBindings;

      for (let name of unbound) {
        let residualBinding = residualBindings.get(name);
        invariant(residualBinding !== undefined);
        if (residualBinding.modified) {
          // Initialize captured scope at function call instead of globally
          if (!residualBinding.declarativeEnvironmentRecord) residualBinding.referentialized = true;
          if (!residualBinding.referentialized) {
            if (!shouldReferentializeInstanceFn(instance)) {
              // TODO #989: Fix additional functions and referentialization
              this.realm.handleError(
                new CompilerDiagnostic(
                  "Referentialization for prepacked functions unimplemented",
                  instance.functionValue.loc,
                  "PP1005",
                  "FatalError"
                )
              );
              throw new FatalError("TODO: implement referentialization for prepacked functions");
            }
            if (!this._options.simpleClosures) this._getSerializedBindingScopeInstance(residualBinding);
            residualBinding.referentialized = true;
          }

          invariant(residualBinding.referentialized);
          if (residualBinding.declarativeEnvironmentRecord && residualBinding.scope) {
            instance.scopeInstances.set(residualBinding.scope.name, residualBinding.scope);
          }
        }
      }
    }
  }

  createCapturedScopesArrayInitialization(referentializationScope: ReferentializationScope): BabelNodeStatement {
    return t.variableDeclaration("var", [
      t.variableDeclarator(
        this._getReferentializationState(referentializationScope).capturedScopesArray,
        t.callExpression(t.identifier("Array"), [
          t.numericLiteral(this._getReferentializationState(referentializationScope).capturedScopeInstanceIdx),
        ])
      ),
    ]);
  }
}
