/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { FatalError } from "../errors.js";
import { Realm } from "../realm.js";
import { FunctionValue, ECMAScriptSourceFunctionValue, ObjectValue } from "../values/index.js";
import type { SerializerOptions } from "../options.js";
import * as t from "@babel/types";
import type {
  BabelNodeCallExpression,
  BabelNodeClassMethod,
  BabelNodeClassExpression,
  BabelNodeExpression,
  BabelNodeStatement,
  BabelNodeIdentifier,
  BabelNodeBlockStatement,
  BabelNodeLVal,
  BabelNodeSpreadElement,
  BabelNodeFunctionExpression,
  BabelNodeArrowFunctionExpression,
} from "@babel/types";
import type { FunctionBodyAstNode } from "../types.js";
import type { NameGenerator } from "../utils/NameGenerator.js";
import invariant from "../invariant.js";
import type {
  ResidualFunctionBinding,
  FunctionInfo,
  FactoryFunctionInfo,
  FunctionInstance,
  AdditionalFunctionInfo,
} from "./types.js";
import { BodyReference, AreSameResidualBinding } from "./types.js";
import { SerializerStatistics } from "./statistics.js";
import { ResidualFunctionInstantiator, type Replacement, getReplacement } from "./ResidualFunctionInstantiator.js";
import { Modules } from "../utils/modules.js";
import { ResidualFunctionInitializers } from "./ResidualFunctionInitializers.js";
import { nullExpression } from "../utils/babelhelpers.js";
import type { LocationService, ClassMethodInstance } from "./types.js";
import { Referentializer } from "./Referentializer.js";
import { getOrDefault } from "./utils.js";

type ResidualFunctionsResult = {
  unstrictFunctionBodies: Array<BabelNodeFunctionExpression | BabelNodeArrowFunctionExpression>,
  strictFunctionBodies: Array<BabelNodeFunctionExpression | BabelNodeArrowFunctionExpression>,
};

export class ResidualFunctions {
  constructor(
    realm: Realm,
    options: SerializerOptions,
    modules: Modules,
    requireReturns: Map<number | string, Replacement>,
    locationService: LocationService,
    prelude: Array<BabelNodeStatement>,
    factoryNameGenerator: NameGenerator,
    residualFunctionInfos: Map<BabelNodeBlockStatement, FunctionInfo>,
    residualFunctionInstances: Map<FunctionValue, FunctionInstance>,
    residualClassMethodInstances: Map<FunctionValue, ClassMethodInstance>,
    additionalFunctionValueInfos: Map<FunctionValue, AdditionalFunctionInfo>,
    additionalFunctionValueNestedFunctions: Set<FunctionValue>,
    referentializer: Referentializer
  ) {
    this.realm = realm;
    this.modules = modules;
    this.requireReturns = requireReturns;
    this.locationService = locationService;
    this.prelude = prelude;
    this.factoryNameGenerator = factoryNameGenerator;
    this.functionPrototypes = new Map();
    this.firstFunctionUsages = new Map();
    this.functions = new Map();
    this.classes = new Map();
    this.functionInstances = [];
    this.residualFunctionInitializers = new ResidualFunctionInitializers(locationService);
    this.residualFunctionInfos = residualFunctionInfos;
    this.residualFunctionInstances = residualFunctionInstances;
    this.residualClassMethodInstances = residualClassMethodInstances;
    this.additionalFunctionValueInfos = additionalFunctionValueInfos;
    this.referentializer = referentializer;
    for (let instance of residualFunctionInstances.values()) {
      invariant(instance !== undefined);
      if (!additionalFunctionValueInfos.has(instance.functionValue)) this.addFunctionInstance(instance);
    }
    this.additionalFunctionValueNestedFunctions = additionalFunctionValueNestedFunctions;
    this.additionalFunctionPreludes = new Map();
    for (let functionValue of additionalFunctionValueInfos.keys()) {
      this.additionalFunctionPreludes.set(functionValue, []);
    }
  }

  realm: Realm;
  modules: Modules;
  requireReturns: Map<number | string, Replacement>;
  locationService: LocationService;
  prelude: Array<BabelNodeStatement>;
  factoryNameGenerator: NameGenerator;
  functionPrototypes: Map<FunctionValue, BabelNodeIdentifier>;
  firstFunctionUsages: Map<FunctionValue, BodyReference>;
  functions: Map<BabelNodeBlockStatement, Array<FunctionInstance>>;
  classes: Map<ObjectValue, BabelNodeClassExpression>;
  functionInstances: Array<FunctionInstance>;
  residualFunctionInitializers: ResidualFunctionInitializers;
  residualFunctionInfos: Map<BabelNodeBlockStatement, FunctionInfo>;
  residualFunctionInstances: Map<FunctionValue, FunctionInstance>;
  residualClassMethodInstances: Map<FunctionValue, ClassMethodInstance>;
  additionalFunctionValueInfos: Map<FunctionValue, AdditionalFunctionInfo>;
  additionalFunctionValueNestedFunctions: Set<FunctionValue>;
  referentializer: Referentializer;
  additionalFunctionPreludes: Map<FunctionValue, Array<BabelNodeStatement>>;

  getStatistics(): SerializerStatistics {
    invariant(this.realm.statistics instanceof SerializerStatistics, "serialization requires SerializerStatistics");
    return this.realm.statistics;
  }

  addFunctionInstance(instance: FunctionInstance): void {
    this.functionInstances.push(instance);
    let code = instance.functionValue.$ECMAScriptCode;
    invariant(code != null);
    getOrDefault(this.functions, code, () => []).push(instance);
  }

  setFunctionPrototype(constructor: FunctionValue, prototypeId: BabelNodeIdentifier): void {
    this.functionPrototypes.set(constructor, prototypeId);
  }

  addFunctionUsage(val: FunctionValue, bodyReference: BodyReference): void {
    if (!this.firstFunctionUsages.has(val)) this.firstFunctionUsages.set(val, bodyReference);
  }

  _shouldUseFactoryFunction(funcBody: BabelNodeBlockStatement, instances: Array<FunctionInstance>): boolean {
    invariant(instances.length > 0);
    function shouldInlineFunction(): boolean {
      if (instances[0].scopeInstances.size > 0) return false;
      let shouldInline = true;
      if (funcBody.start && funcBody.end) {
        let bodySize = funcBody.end - funcBody.start;
        shouldInline = bodySize <= 30;
      }
      return shouldInline;
    }
    let functionInfo = this.residualFunctionInfos.get(funcBody);
    invariant(functionInfo);
    let { usesArguments } = functionInfo;
    let hasAnyLeakedIds = false;
    for (const instance of instances)
      for (const scope of instance.scopeInstances.values()) if (scope.leakedIds.length > 0) hasAnyLeakedIds = true;
    return !shouldInlineFunction() && instances.length > 1 && !usesArguments && !hasAnyLeakedIds;
  }

  _getIdentifierReplacements(
    funcBody: BabelNodeBlockStatement,
    residualFunctionBindings: Map<string, ResidualFunctionBinding>
  ): Map<BabelNodeIdentifier, Replacement> {
    let functionInfo = this.residualFunctionInfos.get(funcBody);
    invariant(functionInfo);
    let { unbound } = functionInfo;
    let res = new Map();
    for (let [name, nodes] of unbound) {
      let residualFunctionBinding = residualFunctionBindings.get(name);
      if (residualFunctionBinding === undefined) continue;

      // Let's skip bindings that are referring to
      // 1) something global (without an environment record), and
      // 2) have not been assigned a value (which would mean that they have a var/let binding and Prepack will take the liberty to rename them).
      if (
        residualFunctionBinding.declarativeEnvironmentRecord === null &&
        residualFunctionBinding.value === undefined
      ) {
        continue;
      }

      let serializedValue = residualFunctionBinding.serializedValue;
      invariant(serializedValue !== undefined);
      let replacement = getReplacement(
        serializedValue,
        residualFunctionBinding.referentialized ? undefined : residualFunctionBinding.value
      );
      for (let node of nodes) res.set(node, replacement);
    }
    return res;
  }

  _getCallReplacements(funcBody: BabelNodeBlockStatement): Map<BabelNode, Replacement> {
    let functionInfo = this.residualFunctionInfos.get(funcBody);
    invariant(functionInfo);
    let { requireCalls, modified } = functionInfo;
    let res = new Map();
    for (let [callNode, moduleId] of requireCalls) {
      this.getStatistics().requireCalls++;
      if (modified.has(callNode.callee.name)) continue;

      let replacement = this.requireReturns.get("" + moduleId);
      if (replacement !== undefined) {
        this.getStatistics().requireCallsReplaced++;
        res.set(callNode, replacement);
      }
    }
    return res;
  }

  // Note: this function takes linear time. Please do not call it inside loop.
  _hasRewrittenFunctionInstance(
    rewrittenAdditionalFunctions: Map<FunctionValue, Array<BabelNodeStatement>>,
    instances: Array<FunctionInstance>
  ): boolean {
    return instances.find(instance => rewrittenAdditionalFunctions.has(instance.functionValue)) !== undefined;
  }

  _generateFactoryFunctionInfos(
    rewrittenAdditionalFunctions: Map<FunctionValue, Array<BabelNodeStatement>>
  ): Map<number, FactoryFunctionInfo> {
    const factoryFunctionInfos = new Map();
    for (const [functionBody, instances] of this.functions) {
      invariant(instances.length > 0);

      let factoryId;
      const suffix = instances[0].functionValue.__originalName || this.realm.debugNames ? "factoryFunction" : "";
      if (this._shouldUseFactoryFunction(functionBody, instances)) {
        // Rewritten function should never use factory function.
        invariant(!this._hasRewrittenFunctionInstance(rewrittenAdditionalFunctions, instances));
        factoryId = t.identifier(this.factoryNameGenerator.generate(suffix));
      } else {
        // For inline function body case, use the first function as the factory function.
        factoryId = this.locationService.getLocation(instances[0].functionValue);
      }

      const functionUniqueTag = ((functionBody: any): FunctionBodyAstNode).uniqueOrderedTag;
      invariant(functionUniqueTag);

      const functionInfo = this.residualFunctionInfos.get(functionBody);
      invariant(functionInfo);
      let anyContainingAdditionalFunction = !instances.every(
        instance => instance.containingAdditionalFunction === undefined
      );
      factoryFunctionInfos.set(functionUniqueTag, { factoryId, functionInfo, anyContainingAdditionalFunction });
    }
    return factoryFunctionInfos;
  }

  // Preserve residual functions' ordering based on its ast dfs traversal order.
  // This is necessary to prevent unexpected code locality issues.
  _sortFunctionByOriginalOrdering(functionEntries: Array<[BabelNodeBlockStatement, Array<FunctionInstance>]>): void {
    functionEntries.sort((funcA, funcB) => {
      const funcAUniqueTag = ((funcA[0]: any): FunctionBodyAstNode).uniqueOrderedTag;
      invariant(funcAUniqueTag);

      const funcBUniqueTag = ((funcB[0]: any): FunctionBodyAstNode).uniqueOrderedTag;
      invariant(funcBUniqueTag);
      return funcAUniqueTag - funcBUniqueTag;
    });
  }

  _createFunctionExpression(
    params: Array<BabelNodeLVal>,
    body: BabelNodeBlockStatement,
    isLexical: boolean
  ): BabelNodeFunctionExpression | BabelNodeArrowFunctionExpression {
    // Additional statements might be inserted at the beginning of the body, so we clone it.
    body = ((Object.assign({}, body): any): BabelNodeBlockStatement);
    return isLexical ? t.arrowFunctionExpression(params, body) : t.functionExpression(null, params, body);
  }

  spliceFunctions(
    rewrittenAdditionalFunctions: Map<FunctionValue, Array<BabelNodeStatement>>
  ): ResidualFunctionsResult {
    this.residualFunctionInitializers.scrubFunctionInitializers();

    let functionBodies = new Map();
    // these need to get spliced in at the end
    let additionalFunctionModifiedBindingsSegment: Map<FunctionValue, Array<BabelNodeStatement>> = new Map();
    let getModifiedBindingsSegment = additionalFunction =>
      getOrDefault(additionalFunctionModifiedBindingsSegment, additionalFunction, () => []);
    let getFunctionBody = (instance: FunctionInstance): Array<BabelNodeStatement> =>
      getOrDefault(functionBodies, instance, () => []);
    let getPrelude = (instance: FunctionInstance): Array<BabelNodeStatement> => {
      let additionalFunction = instance.containingAdditionalFunction;
      let b;
      if (additionalFunction !== undefined) {
        b = this.additionalFunctionPreludes.get(additionalFunction);
        invariant(b !== undefined);
      } else {
        b = this.prelude;
      }
      return b;
    };

    let functionEntries: Array<[BabelNodeBlockStatement, Array<FunctionInstance>]> = Array.from(
      this.functions.entries()
    );
    this._sortFunctionByOriginalOrdering(functionEntries);
    this.getStatistics().functions = functionEntries.length;
    let unstrictFunctionBodies: Array<BabelNodeFunctionExpression | BabelNodeArrowFunctionExpression> = [];
    let strictFunctionBodies: Array<BabelNodeFunctionExpression | BabelNodeArrowFunctionExpression> = [];
    let registerFunctionStrictness = (
      node:
        | BabelNodeFunctionExpression
        | BabelNodeArrowFunctionExpression
        | BabelNodeClassMethod
        | BabelNodeClassExpression,
      strict: boolean
    ) => {
      if (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
        (strict ? strictFunctionBodies : unstrictFunctionBodies).push(
          ((node: any): BabelNodeFunctionExpression | BabelNodeArrowFunctionExpression)
        );
      }
    };
    let funcNodes: Map<FunctionValue, BabelNodeFunctionExpression> = new Map();
    let defineFunction = (
      instance: FunctionInstance,
      funcId: BabelNodeIdentifier,
      funcOrClassNode:
        | BabelNodeCallExpression
        | BabelNodeFunctionExpression
        | BabelNodeArrowFunctionExpression
        | BabelNodeClassExpression
    ) => {
      let { functionValue } = instance;

      if (instance.initializationStatements.length > 0) {
        // always add initialization statements to insertion point
        let initializationBody = getFunctionBody(instance);
        Array.prototype.push.apply(initializationBody, instance.initializationStatements);
      }

      let body;
      if (t.isFunctionExpression(funcOrClassNode)) {
        funcNodes.set(functionValue, ((funcOrClassNode: any): BabelNodeFunctionExpression));
        body = getPrelude(instance);
      } else {
        invariant(
          t.isCallExpression(funcOrClassNode) ||
            t.isClassExpression(funcOrClassNode) ||
            t.isArrowFunctionExpression(funcOrClassNode)
        ); // .bind call
        body = getFunctionBody(instance);
      }
      body.push(t.variableDeclaration("var", [t.variableDeclarator(funcId, funcOrClassNode)]));
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

    // Emit code for ModifiedBindings for additional functions
    for (let [funcValue, funcInfo] of this.additionalFunctionValueInfos) {
      let scopes = new Set();
      for (let [, residualBinding] of funcInfo.modifiedBindings) {
        let scope = residualBinding.scope;
        if (scope === undefined || scopes.has(scope)) continue;
        scopes.add(scope);

        invariant(residualBinding.referentialized);

        // Find the proper prelude to emit to (global vs additional function's prelude)
        let bodySegment = getModifiedBindingsSegment(funcValue);

        // binding has been referentialized, so setup the scope to be able to
        // access bindings from other __captured_scopes initializers
        if (scope.referentializationScope !== funcValue) {
          let init = this.referentializer.getReferentializedScopeInitialization(scope, t.numericLiteral(scope.id));
          // flow forces me to do this
          Array.prototype.push.apply(bodySegment, init);
        }
      }
    }

    // Process Additional Functions
    for (let [funcValue, additionalFunctionInfo] of this.additionalFunctionValueInfos.entries()) {
      let { instance } = additionalFunctionInfo;
      let functionValue = ((funcValue: any): ECMAScriptSourceFunctionValue);
      let params = functionValue.$FormalParameters;
      let isLexical = functionValue.$ThisMode === "lexical";
      invariant(params !== undefined);

      let rewrittenBody = rewrittenAdditionalFunctions.get(funcValue);
      invariant(rewrittenBody);

      // rewritten functions shouldn't have references fixed up because the body,
      // consists of serialized code. For simplicity we emit their instances in a naive way
      let functionBody = t.blockStatement(rewrittenBody);
      let funcOrClassNode;

      if (this.residualClassMethodInstances.has(funcValue)) {
        let classMethodInstance = this.residualClassMethodInstances.get(funcValue);
        invariant(classMethodInstance);
        let {
          methodType,
          classMethodKeyNode,
          classSuperNode,
          classMethodComputed,
          classPrototype,
          classMethodIsStatic,
        } = classMethodInstance;

        let isConstructor = methodType === "constructor";
        invariant(classPrototype instanceof ObjectValue);
        invariant(classMethodKeyNode && (t.isExpression(classMethodKeyNode) || t.isIdentifier(classMethodKeyNode)));
        // we use the classPrototype as the key to get the class expression ast node
        funcOrClassNode = this._getOrCreateClassNode(classPrototype);
        let classMethod = t.classMethod(
          methodType,
          classMethodKeyNode,
          params,
          functionBody,
          classMethodComputed,
          classMethodIsStatic
        );
        // add the class method to the class expression node body
        if (isConstructor) {
          funcOrClassNode.body.body.unshift(classMethod);
        } else {
          funcOrClassNode.body.body.push(classMethod);
        }
        // we only return the funcOrClassNode if this is the constructor
        if (!isConstructor) {
          continue;
        }
        // handle the class super
        if (classSuperNode !== undefined) {
          funcOrClassNode.superClass = classSuperNode;
        }
      } else {
        funcOrClassNode = isLexical
          ? t.arrowFunctionExpression(params, functionBody)
          : t.functionExpression(null, params, functionBody);
      }
      let id = this.locationService.getLocation(funcValue);
      invariant(id !== undefined);

      registerFunctionStrictness(
        funcOrClassNode,
        funcValue instanceof ECMAScriptSourceFunctionValue && funcValue.$Strict
      );
      defineFunction(instance, id, funcOrClassNode);
    }

    // Process normal functions
    const factoryFunctionInfos = this._generateFactoryFunctionInfos(rewrittenAdditionalFunctions);
    for (let [funcBody, instances] of functionEntries) {
      let functionInfo = this.residualFunctionInfos.get(funcBody);
      invariant(functionInfo);
      let { unbound, usesThis } = functionInfo;
      let params = instances[0].functionValue.$FormalParameters;
      invariant(params !== undefined);

      // Split instances into normal or nested in an additional function
      let normalInstances = [];
      let additionalFunctionNestedInstances = [];
      for (let instance of instances) {
        if (this.additionalFunctionValueNestedFunctions.has(instance.functionValue))
          additionalFunctionNestedInstances.push(instance);
        else normalInstances.push(instance);
      }

      let naiveProcessInstances = instancesToSplice => {
        this.getStatistics().functionClones += instancesToSplice.length;

        for (let instance of instancesToSplice) {
          let { functionValue, residualFunctionBindings, scopeInstances } = instance;
          let funcOrClassNode;

          if (this.residualClassMethodInstances.has(functionValue)) {
            let classMethodInstance = this.residualClassMethodInstances.get(functionValue);
            invariant(classMethodInstance);
            let {
              classSuperNode,
              classMethodKeyNode,
              methodType,
              classMethodComputed,
              classPrototype,
              classMethodIsStatic,
            } = classMethodInstance;

            let isConstructor = methodType === "constructor";
            invariant(classPrototype instanceof ObjectValue);
            invariant(classMethodKeyNode);
            invariant(t.isExpression(classMethodKeyNode) || t.isIdentifier(classMethodKeyNode));
            // we use the classPrototype as the key to get the class expression ast node
            funcOrClassNode = this._getOrCreateClassNode(classPrototype);
            // if we are dealing with a constructor, don't serialize it if the original
            // had an empty user-land constructor (because we create a constructor behind the scenes for them)
            let hasEmptyConstructor = !!functionValue.$HasEmptyConstructor;
            if (!isConstructor || (isConstructor && !hasEmptyConstructor)) {
              let methodParams = params.slice();
              let classMethod = new ResidualFunctionInstantiator(
                factoryFunctionInfos,
                this.realm.moduleFactoryFunctionsToRemove,
                this._getIdentifierReplacements(funcBody, residualFunctionBindings),
                this._getCallReplacements(funcBody),
                t.classMethod(
                  methodType,
                  classMethodKeyNode,
                  methodParams,
                  funcBody,
                  classMethodComputed,
                  classMethodIsStatic
                )
              ).instantiate();

              // add the class method to the class expression node body
              if (isConstructor) {
                funcOrClassNode.body.body.unshift(classMethod);
              } else {
                funcOrClassNode.body.body.push(classMethod);
              }
            }
            // we only return the funcOrClassNode if this is the constructor
            if (!isConstructor) {
              continue;
            }
            // handle the class super
            if (classSuperNode !== undefined) {
              funcOrClassNode.superClass = classSuperNode;
            }
          } else {
            let isLexical = instance.functionValue.$ThisMode === "lexical";
            funcOrClassNode = new ResidualFunctionInstantiator(
              factoryFunctionInfos,
              this.realm.moduleFactoryFunctionsToRemove,
              this._getIdentifierReplacements(funcBody, residualFunctionBindings),
              this._getCallReplacements(funcBody),
              this._createFunctionExpression(params, funcBody, isLexical)
            ).instantiate();

            let scopeInitialization = [];
            for (let scope of scopeInstances.values()) {
              scopeInitialization = scopeInitialization.concat(
                this.referentializer.getReferentializedScopeInitialization(scope, t.numericLiteral(scope.id))
              );
            }

            if (scopeInitialization.length > 0) {
              let funcOrClassNodeBody = ((funcOrClassNode.body: any): BabelNodeBlockStatement);
              invariant(t.isBlockStatement(funcOrClassNodeBody));
              funcOrClassNodeBody.body = scopeInitialization.concat(funcOrClassNodeBody.body);
            }
          }
          let id = this.locationService.getLocation(functionValue);
          invariant(id !== undefined);

          registerFunctionStrictness(funcOrClassNode, functionValue.$Strict);
          invariant(id !== undefined);
          invariant(funcOrClassNode !== undefined);
          defineFunction(instance, id, funcOrClassNode);
        }
      };

      if (additionalFunctionNestedInstances.length > 0) naiveProcessInstances(additionalFunctionNestedInstances);
      if (normalInstances.length > 0 && !this._shouldUseFactoryFunction(funcBody, normalInstances)) {
        naiveProcessInstances(normalInstances);
        this.getStatistics().functionClones--;
      } else if (normalInstances.length > 0) {
        const functionUniqueTag = ((funcBody: any): FunctionBodyAstNode).uniqueOrderedTag;
        invariant(functionUniqueTag);
        const factoryInfo = factoryFunctionInfos.get(functionUniqueTag);
        invariant(factoryInfo);
        const { factoryId } = factoryInfo;

        // filter included variables to only include those that are different
        let factoryNames: Array<string> = [];
        let sameResidualBindings = new Map();
        for (let name of unbound.keys()) {
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
        for (let [scopeName, scope] of normalInstances[0].scopeInstances) {
          let scopeNameId = t.identifier(scopeName);
          factoryParams.push(scopeNameId);
          scopeInitialization = scopeInitialization.concat(
            this.referentializer.getReferentializedScopeInitialization(scope, scopeNameId)
          );
        }

        factoryParams = factoryParams.concat(params).slice();
        let factoryNode = new ResidualFunctionInstantiator(
          factoryFunctionInfos,
          this.realm.moduleFactoryFunctionsToRemove,
          this._getIdentifierReplacements(funcBody, sameResidualBindings),
          this._getCallReplacements(funcBody),
          this._createFunctionExpression(factoryParams, funcBody, false)
        ).instantiate();

        if (scopeInitialization.length > 0) {
          let factoryNodeBody = ((factoryNode.body: any): BabelNodeBlockStatement);
          invariant(t.isBlockStatement(factoryNodeBody));
          factoryNodeBody.body = scopeInitialization.concat(factoryNodeBody.body);
        }

        // factory functions do not depend on any nested generator scope, so they go to the prelude
        let factoryDeclaration = t.variableDeclaration("var", [t.variableDeclarator(factoryId, factoryNode)]);
        this.prelude.push(factoryDeclaration);

        registerFunctionStrictness(factoryNode, normalInstances[0].functionValue.$Strict);

        for (let instance of normalInstances) {
          let { functionValue, residualFunctionBindings, insertionPoint } = instance;
          let functionId = this.locationService.getLocation(functionValue);
          invariant(functionId !== undefined);
          let hasFunctionArg = false;
          let flatArgs: Array<BabelNodeExpression> = factoryNames.map(name => {
            let residualBinding = residualFunctionBindings.get(name);
            invariant(residualBinding);
            let serializedValue = residualBinding.serializedValue;
            hasFunctionArg =
              hasFunctionArg || (residualBinding.value && residualBinding.value instanceof FunctionValue);
            invariant(serializedValue);
            return serializedValue;
          });
          let hasAnyLeakedIds = false;
          for (const scope of instance.scopeInstances.values()) {
            flatArgs.push(t.numericLiteral(scope.id));
            if (scope.leakedIds.length > 0) hasAnyLeakedIds = true;
          }
          let funcNode;
          let firstUsage = this.firstFunctionUsages.get(functionValue);
          // todo: why can this be undefined?
          invariant(insertionPoint !== undefined);

          let cannotBind =
            this.residualFunctionInitializers.hasInitializerStatement(functionValue) ||
            usesThis ||
            hasFunctionArg ||
            (firstUsage === undefined || !firstUsage.isNotEarlierThan(insertionPoint)) ||
            this.functionPrototypes.get(functionValue) !== undefined ||
            hasAnyLeakedIds;

          // TODO 2589: Code size reduction opportunity: bring back .bind calls
          cannotBind = true;

          if (cannotBind) {
            // The same free variables in shared instances may refer to objects with different initialization values
            // so a stub forward function is needed during delay initializations.

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
            registerFunctionStrictness(funcNode, functionValue.$Strict);
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

    for (let referentializationScope of this.referentializer.referentializationState.keys()) {
      let prelude;
      // Get the prelude for this additional function value
      if (referentializationScope !== "GLOBAL") {
        let additionalFunction = referentializationScope;
        prelude = this.additionalFunctionPreludes.get(additionalFunction);
        invariant(prelude !== undefined);
      } else {
        prelude = this.prelude;
      }
      prelude.unshift(
        ...this.referentializer.createCapturedScopesPrelude(referentializationScope),
        ...this.referentializer.createLeakedIds(referentializationScope)
      );
    }

    for (let instance of this.functionInstances.reverse()) {
      let functionBody = functionBodies.get(instance);
      if (functionBody !== undefined) {
        let insertionPoint = instance.insertionPoint;
        invariant(insertionPoint instanceof BodyReference);
        // v8 seems to do something clever with array splicing, so this potentially
        // expensive operations seems to be actually cheap.
        insertionPoint.body.entries.splice(insertionPoint.index, 0, ...functionBody);
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

    for (let [additionalFunction, body] of Array.from(rewrittenAdditionalFunctions.entries()).reverse()) {
      let additionalFunctionInfo = this.additionalFunctionValueInfos.get(additionalFunction);
      invariant(additionalFunctionInfo);
      // Modified bindings initializers of optimized function
      let bodySegment = additionalFunctionModifiedBindingsSegment.get(additionalFunction);
      // initializers from Referentialization
      let initializationStatements = getFunctionBody(additionalFunctionInfo.instance);
      let prelude = this.additionalFunctionPreludes.get(additionalFunction);
      invariant(prelude !== undefined);
      let insertionPoint = additionalFunctionInfo.instance.insertionPoint;
      invariant(insertionPoint);
      // TODO: I think this inserts things in the wrong place
      insertionPoint.body.entries.splice(insertionPoint.index, 0, ...initializationStatements);
      if (bodySegment) body.unshift(...bodySegment);
      body.unshift(...prelude);
    }

    return { unstrictFunctionBodies, strictFunctionBodies };
  }
  _getOrCreateClassNode(classPrototype: ObjectValue): BabelNodeClassExpression {
    if (!this.classes.has(classPrototype)) {
      let funcOrClassNode = t.classExpression(null, null, t.classBody([]), []);
      this.classes.set(classPrototype, funcOrClassNode);
      return funcOrClassNode;
    } else {
      let funcOrClassNode = this.classes.get(classPrototype);
      invariant(funcOrClassNode && t.isClassExpression(funcOrClassNode));
      return funcOrClassNode;
    }
  }
}
