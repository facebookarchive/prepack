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
import { FatalError } from "../errors.js";
import { Realm } from "../realm.js";
import { FunctionValue, type ECMAScriptSourceFunctionValue } from "../values/index.js";
import * as t from "babel-types";
import type {
  BabelNodeExpression,
  BabelNodeStatement,
  BabelNodeIdentifier,
  BabelNodeBlockStatement,
  BabelNodeLVal,
  BabelNodeSpreadElement,
  BabelNodeFunctionExpression,
} from "babel-types";
import { NameGenerator } from "../utils/generator.js";
import traverse from "babel-traverse";
import invariant from "../invariant.js";
import type {
  ResidualFunctionBinding,
  ScopeBinding,
  FunctionInfo,
  FunctionInstance,
  AdditionalFunctionInfo,
} from "./types.js";
import { BodyReference, AreSameResidualBinding, SerializerStatistics } from "./types.js";
import { ClosureRefReplacer } from "./visitors.js";
import { Modules } from "./modules.js";
import { ResidualFunctionInitializers } from "./ResidualFunctionInitializers.js";
import { nullExpression } from "../utils/internalizer.js";
import type { LocationService } from "./types.js";

type ResidualFunctionsResult = {
  unstrictFunctionBodies: Array<BabelNodeFunctionExpression>,
  strictFunctionBodies: Array<BabelNodeFunctionExpression>,
  requireStatistics: { replaced: number, count: number },
};

export class ResidualFunctions {
  constructor(
    realm: Realm,
    statistics: SerializerStatistics,
    modules: Modules,
    requireReturns: Map<number | string, BabelNodeExpression>,
    locationService: LocationService,
    prelude: Array<BabelNodeStatement>,
    initializerNameGenerator: NameGenerator,
    factoryNameGenerator: NameGenerator,
    scopeNameGenerator: NameGenerator,
    residualFunctionInfos: Map<BabelNodeBlockStatement, FunctionInfo>,
    residualFunctionInstances: Map<FunctionValue, FunctionInstance>,
    additionalFunctionValueInfos: Map<FunctionValue, AdditionalFunctionInfo>,
    additionalFunctionValueNestedFunctions: Set<FunctionValue>
  ) {
    this.realm = realm;
    this.statistics = statistics;
    this.modules = modules;
    this.requireReturns = requireReturns;
    this.locationService = locationService;
    this.prelude = prelude;
    this.factoryNameGenerator = factoryNameGenerator;
    this.scopeNameGenerator = scopeNameGenerator;
    this._funcToCapturedScopeInstanceIdx = new Map();
    this._funcToCapturedScopesArray = new Map();
    this._funcToCaptureScopeAccessFunctionId = new Map();
    this._funcToSerializedScopes = new Map();
    this.functionPrototypes = new Map();
    this.firstFunctionUsages = new Map();
    this.functions = new Map();
    this.functionInstances = [];
    this.residualFunctionInitializers = new ResidualFunctionInitializers(
      locationService,
      prelude,
      initializerNameGenerator
    );
    this.residualFunctionInfos = residualFunctionInfos;
    this.residualFunctionInstances = residualFunctionInstances;
    this.additionalFunctionValueInfos = additionalFunctionValueInfos;
    for (let instance of residualFunctionInstances.values()) {
      invariant(instance !== undefined);
      if (!additionalFunctionValueInfos.has(instance.functionValue)) this.addFunctionInstance(instance);
    }
    this.additionalFunctionValueNestedFunctions = additionalFunctionValueNestedFunctions;
  }

  realm: Realm;
  modules: Modules;
  statistics: SerializerStatistics;
  requireReturns: Map<number | string, BabelNodeExpression>;
  locationService: LocationService;
  prelude: Array<BabelNodeStatement>;
  factoryNameGenerator: NameGenerator;
  scopeNameGenerator: NameGenerator;
  // Null means not in an additionalFunction
  _funcToCapturedScopeInstanceIdx: Map<FunctionValue | null, number>;
  _funcToCapturedScopesArray: Map<FunctionValue | null, BabelNodeIdentifier>;
  _funcToCaptureScopeAccessFunctionId: Map<FunctionValue | null, BabelNodeIdentifier>;
  _funcToSerializedScopes: Map<FunctionValue | null, Map<DeclarativeEnvironmentRecord, ScopeBinding>>;
  functionPrototypes: Map<FunctionValue, BabelNodeIdentifier>;
  firstFunctionUsages: Map<FunctionValue, BodyReference>;
  functions: Map<BabelNodeBlockStatement, Array<FunctionInstance>>;
  functionInstances: Array<FunctionInstance>;
  residualFunctionInitializers: ResidualFunctionInitializers;
  residualFunctionInfos: Map<BabelNodeBlockStatement, FunctionInfo>;
  residualFunctionInstances: Map<FunctionValue, FunctionInstance>;
  additionalFunctionValueInfos: Map<FunctionValue, AdditionalFunctionInfo>;
  additionalFunctionValueNestedFunctions: Set<FunctionValue>;

  _getOrDefault<K, V>(map: Map<K, V>, key: K, defaultFn: () => V): V {
    let value = map.get(key);
    if (!value) map.set(key, (value = defaultFn()));
    invariant(value !== undefined);
    return value;
  }

  _getCapturedScopeInstanceIdx(functionValue: FunctionValue | null): number {
    return this._getOrDefault(this._funcToCapturedScopeInstanceIdx, functionValue, () => 0);
  }

  _getCapturedScopesArray(functionValue: FunctionValue | null): BabelNodeIdentifier {
    return this._getOrDefault(this._funcToCapturedScopesArray, functionValue, () =>
      t.identifier(this.scopeNameGenerator.generate("main"))
    );
  }

  _getCaptureScopeAccessFunctionId(functionValue: FunctionValue | null): BabelNodeIdentifier {
    return this._getOrDefault(this._funcToCaptureScopeAccessFunctionId, functionValue, () =>
      t.identifier(this.scopeNameGenerator.generate("get_scope_binding"))
    );
  }

  _getSerializedScopes(functionValue: FunctionValue | null): Map<DeclarativeEnvironmentRecord, ScopeBinding> {
    return this._getOrDefault(this._funcToSerializedScopes, functionValue, () => new Map());
  }

  addFunctionInstance(instance: FunctionInstance) {
    this.functionInstances.push(instance);
    let code = instance.functionValue.$ECMAScriptCode;
    invariant(code != null);
    this._getOrDefault(this.functions, code, () => []).push(instance);
  }

  setFunctionPrototype(constructor: FunctionValue, prototypeId: BabelNodeIdentifier) {
    this.functionPrototypes.set(constructor, prototypeId);
  }

  addFunctionUsage(val: FunctionValue, bodyReference: BodyReference) {
    if (!this.firstFunctionUsages.has(val)) this.firstFunctionUsages.set(val, bodyReference);
  }

  // Generate a shared function for accessing captured scope bindings.
  // TODO: skip generating this function if the captured scope is not shared by multiple residual funcitons.
  _createCaptureScopeAccessFunction(functionValue: FunctionValue | null) {
    const body = [];
    const selectorParam = t.identifier("selector");
    const captured = t.identifier("__captured");
    const capturedScopesArray = this._getCapturedScopesArray(functionValue);
    const selectorExpression = t.memberExpression(capturedScopesArray, selectorParam, /*Indexer syntax*/ true);

    // One switch case for one scope.
    const cases = [];
    const serializedScopes = this._getSerializedScopes(functionValue);
    for (const scopeBinding of serializedScopes.values()) {
      const scopeObjectExpression = t.arrayExpression((scopeBinding.initializationValues: any));
      cases.push(
        t.switchCase(t.numericLiteral(scopeBinding.id), [
          t.expressionStatement(t.assignmentExpression("=", selectorExpression, scopeObjectExpression)),
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

    body.push(t.variableDeclaration("var", [t.variableDeclarator(captured, selectorExpression)]));
    body.push(
      t.ifStatement(
        t.unaryExpression("!", captured),
        t.blockStatement([
          t.switchStatement(selectorParam, cases),
          t.expressionStatement(t.assignmentExpression("=", captured, selectorExpression)),
        ])
      )
    );
    body.push(t.returnStatement(captured));
    const factoryFunction = t.functionExpression(null, [selectorParam], t.blockStatement(body));
    const accessFunctionId = this._getCaptureScopeAccessFunctionId(functionValue);
    return t.variableDeclaration("var", [t.variableDeclarator(accessFunctionId, factoryFunction)]);
  }

  _getSerializedBindingScopeInstance(residualBinding: ResidualFunctionBinding): ScopeBinding {
    let declarativeEnvironmentRecord = residualBinding.declarativeEnvironmentRecord;
    let functionValue = residualBinding.referencedOnlyFromAdditionalFunctions || null;
    invariant(declarativeEnvironmentRecord);

    // figure out if this is accessed only from additional functions
    let serializedScopes = this._getSerializedScopes(functionValue);
    let scope = serializedScopes.get(declarativeEnvironmentRecord);
    if (!scope) {
      let id = this._getCapturedScopeInstanceIdx(functionValue);
      scope = {
        name: this.scopeNameGenerator.generate(),
        id,
        initializationValues: [],
        containingAdditionalFunction: residualBinding.referencedOnlyFromAdditionalFunctions,
      };
      this._funcToCapturedScopeInstanceIdx.set(functionValue, ++id);
      serializedScopes.set(declarativeEnvironmentRecord, scope);
    }

    residualBinding.scope = scope;
    return scope;
  }

  _referentialize(
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
          if (!residualBinding.referentialized) {
            if (!shouldReferentializeInstanceFn(instance)) {
              // TODO #989: Fix additional functions and referentialization
              throw new FatalError("TODO: implement referentialization for prepacked functions");
            }
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

            residualBinding.referentialized = true;
            this.statistics.referentialized++;
          }

          // Already referentialized in prior scope
          if (residualBinding.declarativeEnvironmentRecord) {
            invariant(residualBinding.scope);
            instance.scopeInstances.add(residualBinding.scope);
          }
        }
      }
    }
  }

  _getReferentializedScopeInitialization(scope: ScopeBinding) {
    let capturedScope = scope.capturedScope;
    invariant(capturedScope);
    const funcName = this._getCaptureScopeAccessFunctionId(scope.containingAdditionalFunction || null);
    return [
      t.variableDeclaration("var", [
        t.variableDeclarator(t.identifier(capturedScope), t.callExpression(funcName, [t.identifier(scope.name)])),
      ]),
    ];
  }

  spliceFunctions(
    rewrittenAdditionalFunctions: Map<FunctionValue, Array<BabelNodeStatement>>
  ): ResidualFunctionsResult {
    this.residualFunctionInitializers.scrubFunctionInitializers();

    let functionBodies = new Map();
    // these need to get spliced in at the end
    let overriddenPreludes = new Map();
    function getFunctionBody(instance: FunctionInstance): Array<BabelNodeStatement> {
      let b = functionBodies.get(instance);
      if (b === undefined) functionBodies.set(instance, (b = []));
      return b;
    }
    let globalPrelude = this.prelude;
    function getPrelude(instance: FunctionInstance): Array<BabelNodeStatement> {
      let preludeOverride = instance.preludeOverride;
      let b;
      if (preludeOverride) {
        b = overriddenPreludes.get(preludeOverride);
        if (b === undefined) {
          overriddenPreludes.set(preludeOverride, (b = []));
        }
      } else {
        b = globalPrelude;
      }
      return b;
    }

    let requireStatistics = { replaced: 0, count: 0 };

    let functionEntries: Array<[BabelNodeBlockStatement, Array<FunctionInstance>]> = Array.from(
      this.functions.entries()
    );
    this.statistics.functions = functionEntries.length;
    let unstrictFunctionBodies = [];
    let strictFunctionBodies = [];
    let funcNodes: Map<FunctionValue, BabelNodeFunctionExpression> = new Map();

    for (let [funcBody, instances] of functionEntries) {
      let functionInfo = this.residualFunctionInfos.get(funcBody);
      invariant(functionInfo);
      this._referentialize(
        functionInfo.unbound,
        instances,
        instance => !rewrittenAdditionalFunctions.has(instance.functionValue)
      );
    }

    let defineFunction = (instance, funcId, funcNode) => {
      let { functionValue } = instance;
      let body;
      if (t.isFunctionExpression(funcNode)) {
        funcNodes.set(functionValue, ((funcNode: any): BabelNodeFunctionExpression));
        body = getPrelude(instance);
      } else {
        invariant(t.isCallExpression(funcNode)); // .bind call
        body = getFunctionBody(instance);
      }
      body.push(t.variableDeclaration("var", [t.variableDeclarator(funcId, funcNode)]));
      let prototypeId = this.functionPrototypes.get(functionValue);
      if (prototypeId !== undefined) {
        let id = this.locationService.getLocation(functionValue);
        invariant(id !== undefined);
        body.push(
          t.variableDeclaration("var", [
            t.variableDeclarator(prototypeId, t.memberExpression(id, t.identifier("prototype"))),
          ])
        );
      }
    };

    // Process Additional Functions
    for (let [funcValue, additionalFunctionInfo] of this.additionalFunctionValueInfos.entries()) {
      let { instance } = additionalFunctionInfo;
      let functionValue = ((funcValue: any): ECMAScriptSourceFunctionValue);
      let params = functionValue.$FormalParameters;
      invariant(params !== undefined);

      let rewrittenBody = rewrittenAdditionalFunctions.get(funcValue);
      invariant(rewrittenBody);

      // rewritten functions shouldn't have references fixed up because the body,
      // consists of serialized code. For simplicity we emit their instances in a naive way
      let functionBody = t.blockStatement(rewrittenBody);

      let id = this.locationService.getLocation(funcValue);
      invariant(id !== undefined);
      let funcParams = params.slice();
      let funcNode = t.functionExpression(null, funcParams, functionBody);

      if (funcValue.$Strict) {
        strictFunctionBodies.push(funcNode);
      } else {
        unstrictFunctionBodies.push(funcNode);
      }

      defineFunction(instance, id, funcNode);
    }

    // Process normal functions
    for (let [funcBody, instances] of functionEntries) {
      let functionInfo = this.residualFunctionInfos.get(funcBody);
      invariant(functionInfo);
      let { unbound, modified, usesThis, usesArguments } = functionInfo;
      let params = instances[0].functionValue.$FormalParameters;
      invariant(params !== undefined);

      let shouldInline = !funcBody;
      if (!shouldInline && funcBody.start && funcBody.end) {
        let bodySize = funcBody.end - funcBody.start;
        shouldInline = bodySize <= 30;
      }

      // Split instances into normal or nested in an additional function
      let normalInstances = [];
      let additionalFunctionNestedInstances = [];
      for (let instance of instances) {
        if (this.additionalFunctionValueNestedFunctions.has(instance.functionValue))
          additionalFunctionNestedInstances.push(instance);
        else normalInstances.push(instance);
      }

      let naiveProcessInstances = instancesToSplice => {
        this.statistics.functionClones += instancesToSplice.length - 1;

        for (let instance of instancesToSplice) {
          let { functionValue, residualFunctionBindings, scopeInstances } = instance;
          let id = this.locationService.getLocation(functionValue);
          invariant(id !== undefined);
          let funcParams = params.slice();
          let funcNode = t.functionExpression(
            null,
            funcParams,
            ((t.cloneDeep(funcBody): any): BabelNodeBlockStatement)
          );
          let scopeInitialization = [];
          for (let scope of scopeInstances) {
            scopeInitialization.push(
              t.variableDeclaration("var", [t.variableDeclarator(t.identifier(scope.name), t.numericLiteral(scope.id))])
            );
            scopeInitialization = scopeInitialization.concat(this._getReferentializedScopeInitialization(scope));
          }
          funcNode.body.body = scopeInitialization.concat(funcNode.body.body);

          traverse(t.file(t.program([t.expressionStatement(funcNode)])), ClosureRefReplacer, null, {
            residualFunctionBindings,
            modified,
            requireReturns: this.requireReturns,
            requireStatistics,
            isRequire: this.modules.getIsRequire(funcParams, [functionValue]),
          });

          if (functionValue.$Strict) {
            strictFunctionBodies.push(funcNode);
          } else {
            unstrictFunctionBodies.push(funcNode);
          }

          defineFunction(instance, id, funcNode);
        }
      };

      if (additionalFunctionNestedInstances.length > 0) naiveProcessInstances(additionalFunctionNestedInstances);
      if (shouldInline || normalInstances.length === 1 || usesArguments) {
        naiveProcessInstances(normalInstances);
      } else {
        let suffix = normalInstances[0].functionValue.__originalName || "";
        let factoryId = t.identifier(this.factoryNameGenerator.generate(suffix));

        // filter included variables to only include those that are different
        let factoryNames: Array<string> = [];
        let sameResidualBindings = new Map();
        for (let name of unbound) {
          let isDifferent = false;
          let lastBinding;

          let firstBinding = normalInstances[0].residualFunctionBindings.get(name);
          invariant(firstBinding);
          if (firstBinding.modified) {
            // Must modify for traversal
            sameResidualBindings.set(name, firstBinding);
            continue;
          }

          for (let { residualFunctionBindings } of normalInstances) {
            let residualBinding = residualFunctionBindings.get(name);

            invariant(residualBinding);
            invariant(!residualBinding.modified);
            if (!lastBinding) {
              lastBinding = residualBinding;
            } else if (!AreSameResidualBinding(this.realm, residualBinding, lastBinding)) {
              isDifferent = true;
              break;
            }
          }

          if (isDifferent) {
            factoryNames.push(name);
          } else {
            invariant(lastBinding);
            sameResidualBindings.set(name, lastBinding);
          }
        }

        let factoryParams: Array<BabelNodeLVal> = [];
        for (let key of factoryNames) {
          factoryParams.push(t.identifier(key));
        }

        let scopeInitialization = [];
        for (let scope of normalInstances[0].scopeInstances) {
          factoryParams.push(t.identifier(scope.name));
          scopeInitialization = scopeInitialization.concat(this._getReferentializedScopeInitialization(scope));
        }

        factoryParams = factoryParams.concat(params).slice();

        // The Replacer below mutates the AST while the original AST may still be referenced
        // by another outer residual function so let's clone the original AST to avoid modifying it.
        let factoryNode = t.functionExpression(
          null,
          factoryParams,
          ((t.cloneDeep(funcBody): any): BabelNodeBlockStatement)
        );

        if (normalInstances[0].functionValue.$Strict) {
          strictFunctionBodies.push(factoryNode);
        } else {
          unstrictFunctionBodies.push(factoryNode);
        }

        factoryNode.body.body = scopeInitialization.concat(factoryNode.body.body);

        // factory functions do not depend on any nested generator scope, so they go to the prelude
        let factoryDeclaration = t.variableDeclaration("var", [t.variableDeclarator(factoryId, factoryNode)]);
        this.prelude.push(factoryDeclaration);

        traverse(t.file(t.program([t.expressionStatement(factoryNode)])), ClosureRefReplacer, null, {
          residualFunctionBindings: sameResidualBindings,
          modified,
          requireReturns: this.requireReturns,
          requireStatistics,
          isRequire: this.modules.getIsRequire(factoryParams, normalInstances.map(instance => instance.functionValue)),
        });

        for (let instance of normalInstances) {
          let { functionValue, residualFunctionBindings, insertionPoint } = instance;
          let functionId = this.locationService.getLocation(functionValue);
          invariant(functionId !== undefined);
          let flatArgs: Array<BabelNodeExpression> = factoryNames.map(name => {
            let residualBinding = residualFunctionBindings.get(name);
            invariant(residualBinding);
            let serializedValue = residualBinding.serializedValue;
            invariant(serializedValue);
            return serializedValue;
          });
          for (let { id } of instance.scopeInstances) {
            flatArgs.push(t.numericLiteral(id));
          }
          let funcNode;
          let firstUsage = this.firstFunctionUsages.get(functionValue);
          invariant(insertionPoint !== undefined);
          if (
            // The same free variables in shared instances may refer to objects with different initialization values
            // so a stub forward function is needed during delay initializations.
            this.residualFunctionInitializers.hasInitializerStatement(functionValue) ||
            usesThis ||
            (firstUsage !== undefined && !firstUsage.isNotEarlierThan(insertionPoint)) ||
            this.functionPrototypes.get(functionValue) !== undefined
          ) {
            let callArgs: Array<BabelNodeExpression | BabelNodeSpreadElement> = [t.thisExpression()];
            for (let flatArg of flatArgs) callArgs.push(flatArg);
            for (let param of params) {
              if (param.type !== "Identifier") {
                throw new FatalError("TODO: do not know how to deal with non-Identifier parameters");
              }
              callArgs.push(((param: any): BabelNodeIdentifier));
            }

            let callee = t.memberExpression(factoryId, t.identifier("call"));

            let childBody = t.blockStatement([t.returnStatement(t.callExpression(callee, callArgs))]);

            funcNode = t.functionExpression(null, params, childBody);
            if (functionValue.$Strict) {
              strictFunctionBodies.push(funcNode);
            } else {
              unstrictFunctionBodies.push(funcNode);
            }
          } else {
            funcNode = t.callExpression(
              t.memberExpression(factoryId, t.identifier("bind")),
              [nullExpression].concat(flatArgs)
            );
          }

          defineFunction(instance, functionId, funcNode);
        }
      }
    }

    for (let additionalFunctionValue of this._funcToCapturedScopeInstanceIdx.keys()) {
      let prelude = this.prelude;
      // Get the prelude for this additional function value
      if (additionalFunctionValue) {
        let rewrittenBody = rewrittenAdditionalFunctions.get(additionalFunctionValue);
        prelude = overriddenPreludes.get(rewrittenBody);
        if (!prelude) {
          prelude = [];
          overriddenPreludes.set(rewrittenBody, prelude);
        }
      }
      prelude.unshift(this._createCaptureScopeAccessFunction(additionalFunctionValue));
      let scopeVar = t.variableDeclaration("var", [
        t.variableDeclarator(
          this._getCapturedScopesArray(additionalFunctionValue),
          t.callExpression(t.identifier("Array"), [
            t.numericLiteral(this._getCapturedScopeInstanceIdx(additionalFunctionValue)),
          ])
        ),
      ]);
      // The `scopeVar` must be put in the prelude of the additional function (or the global prelude).
      prelude.unshift(scopeVar);
    }

    for (let [preludeOverride, body] of overriddenPreludes.entries()) {
      invariant(preludeOverride);
      let prelude = ((body: any): Array<BabelNodeStatement>);
      preludeOverride.unshift(...prelude);
    }

    for (let instance of this.functionInstances.reverse()) {
      let functionBody = functionBodies.get(instance);
      if (functionBody !== undefined) {
        let insertionPoint = instance.insertionPoint;
        invariant(insertionPoint instanceof BodyReference);
        // v8 seems to do something clever with array splicing, so this potentially
        // expensive operations seems to be actually cheap.
        Array.prototype.splice.apply(
          insertionPoint.body,
          ([insertionPoint.index, 0]: Array<any>).concat((functionBody: Array<any>))
        );
      }
    }

    // Inject initializer code for indexed vars into functions (for delay initializations)
    for (let [functionValue, funcNode] of funcNodes) {
      let initializerStatement = this.residualFunctionInitializers.getInitializerStatement(functionValue);
      if (initializerStatement !== undefined) {
        invariant(t.isFunctionExpression(funcNode));
        let blockStatement: BabelNodeBlockStatement = ((funcNode: any): BabelNodeFunctionExpression).body;
        blockStatement.body.unshift(initializerStatement);
      }
    }

    return { unstrictFunctionBodies, strictFunctionBodies, requireStatistics };
  }
}
