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
import { FunctionValue, type ECMAScriptSourceFunctionValue, ObjectValue } from "../values/index.js";
import type { SerializerOptions } from "../options.js";
import * as t from "babel-types";
import type {
  BabelNodeExpression,
  BabelNodeStatement,
  BabelNodeIdentifier,
  BabelNodeBlockStatement,
  BabelNodeLVal,
  BabelNodeSpreadElement,
  BabelNodeFunctionExpression,
  BabelNodeClassExpression,
} from "babel-types";
import type { FunctionBodyAstNode } from "../types.js";
import type { NameGenerator } from "../utils/generator.js";
import traverse from "babel-traverse";
import invariant from "../invariant.js";
import type { FunctionInfo, FactoryFunctionInfo, FunctionInstance, AdditionalFunctionInfo } from "./types.js";
import { BodyReference, AreSameResidualBinding, SerializerStatistics } from "./types.js";
import { ClosureRefReplacer } from "./visitors.js";
import { Modules } from "../utils/modules.js";
import { ResidualFunctionInitializers } from "./ResidualFunctionInitializers.js";
import { nullExpression } from "../utils/internalizer.js";
import type { LocationService, ClassMethodInstance } from "./types.js";
import { Referentializer } from "./Referentializer.js";
import { getOrDefault } from "./utils.js";

type ResidualFunctionsResult = {
  unstrictFunctionBodies: Array<BabelNodeFunctionExpression | BabelNodeClassExpression>,
  strictFunctionBodies: Array<BabelNodeFunctionExpression | BabelNodeClassExpression>,
  requireStatistics: { replaced: number, count: number },
};

export class ResidualFunctions {
  constructor(
    realm: Realm,
    statistics: SerializerStatistics,
    options: SerializerOptions,
    modules: Modules,
    requireReturns: Map<number | string, BabelNodeExpression>,
    locationService: LocationService,
    prelude: Array<BabelNodeStatement>,
    initializerNameGenerator: NameGenerator,
    factoryNameGenerator: NameGenerator,
    residualFunctionInfos: Map<BabelNodeBlockStatement, FunctionInfo>,
    residualFunctionInstances: Map<FunctionValue, FunctionInstance>,
    residualClassMethodInstances: Map<FunctionValue, ClassMethodInstance>,
    additionalFunctionValueInfos: Map<FunctionValue, AdditionalFunctionInfo>,
    additionalFunctionValueNestedFunctions: Set<FunctionValue>,
    referentializer: Referentializer
  ) {
    this.realm = realm;
    this.statistics = statistics;
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
    this.residualFunctionInitializers = new ResidualFunctionInitializers(
      locationService,
      prelude,
      initializerNameGenerator
    );
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
    this.simpleClosures = !!options.simpleClosures;
  }

  realm: Realm;
  modules: Modules;
  statistics: SerializerStatistics;
  requireReturns: Map<number | string, BabelNodeExpression>;
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
  simpleClosures: boolean;

  addFunctionInstance(instance: FunctionInstance) {
    this.functionInstances.push(instance);
    let code = instance.functionValue.$ECMAScriptCode;
    invariant(code != null);
    getOrDefault(this.functions, code, () => []).push(instance);
  }

  setFunctionPrototype(constructor: FunctionValue, prototypeId: BabelNodeIdentifier) {
    this.functionPrototypes.set(constructor, prototypeId);
  }

  addFunctionUsage(val: FunctionValue, bodyReference: BodyReference) {
    if (!this.firstFunctionUsages.has(val)) this.firstFunctionUsages.set(val, bodyReference);
  }

  _shouldUseFactoryFunction(funcBody: BabelNodeBlockStatement, instances: Array<FunctionInstance>) {
    function shouldInlineFunction(): boolean {
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
    return !shouldInlineFunction() && instances.length > 1 && !usesArguments && !this.simpleClosures;
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
      factoryFunctionInfos.set(functionUniqueTag, { factoryId, functionInfo });
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

  spliceFunctions(
    rewrittenAdditionalFunctions: Map<FunctionValue, Array<BabelNodeStatement>>
  ): ResidualFunctionsResult {
    this.residualFunctionInitializers.scrubFunctionInitializers();

    let functionBodies = new Map();
    // these need to get spliced in at the end
    let additionalFunctionPreludes = new Map();
    let additionalFunctionModifiedBindingsSegment: Map<FunctionValue, Array<BabelNodeStatement>> = new Map();
    let getModifiedBindingsSegment = additionalFunction =>
      getOrDefault(additionalFunctionModifiedBindingsSegment, additionalFunction, () => []);
    let getFunctionBody = (instance: FunctionInstance): Array<BabelNodeStatement> =>
      getOrDefault(functionBodies, instance, () => []);
    let globalPrelude = this.prelude;
    function getPrelude(instance: FunctionInstance): Array<BabelNodeStatement> {
      let additionalFunction = instance.containingAdditionalFunction;
      let b;
      if (additionalFunction) {
        b = getOrDefault(additionalFunctionPreludes, additionalFunction, () => []);
      } else {
        b = globalPrelude;
      }
      return b;
    }

    let requireStatistics = { replaced: 0, count: 0 };

    let functionEntries: Array<[BabelNodeBlockStatement, Array<FunctionInstance>]> = Array.from(
      this.functions.entries()
    );
    this._sortFunctionByOriginalOrdering(functionEntries);
    this.statistics.functions = functionEntries.length;
    let unstrictFunctionBodies = [];
    let strictFunctionBodies = [];
    let funcNodes: Map<FunctionValue, BabelNodeFunctionExpression> = new Map();

    let defineFunction = (instance, funcId, funcOrClassNode) => {
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
        invariant(t.isCallExpression(funcOrClassNode) || t.isClassExpression(funcOrClassNode)); // .bind call
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
      for (let [, residualBinding] of funcInfo.modifiedBindings) {
        let scope = residualBinding.scope;

        // TODO #989: This should probably be an invariant once captures work properly
        // Currently we don't referentialize bindings in additional functions (but we
        // do for bindings nested in additional functions)
        if (!residualBinding.referentialized) continue;

        // Find the proper prelude to emit to (global vs additional function's prelude)
        let bodySegment = getModifiedBindingsSegment(funcValue);

        // binding has been referentialized, so setup the scope to be able to
        // access bindings from other __captured_scopes initializers
        if (scope && scope.containingAdditionalFunction !== funcValue) {
          let decl = t.variableDeclaration("var", [
            t.variableDeclarator(t.identifier(scope.name), t.numericLiteral(scope.id)),
          ]);
          let init = this.referentializer.getReferentializedScopeInitialization(scope);
          bodySegment.push(decl);
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
      invariant(params !== undefined);

      let rewrittenBody = rewrittenAdditionalFunctions.get(funcValue);
      invariant(rewrittenBody);

      // rewritten functions shouldn't have references fixed up because the body,
      // consists of serialized code. For simplicity we emit their instances in a naive way
      let functionBody = t.blockStatement(rewrittenBody);
      let funcParams = params.slice();
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
          funcParams,
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
        funcOrClassNode = t.functionExpression(null, funcParams, functionBody);
      }
      let id = this.locationService.getLocation(funcValue);
      invariant(id !== undefined);

      if (funcValue.$Strict) {
        strictFunctionBodies.push(funcOrClassNode);
      } else {
        unstrictFunctionBodies.push(funcOrClassNode);
      }
      defineFunction(instance, id, funcOrClassNode);
    }

    // Process normal functions
    const factoryFunctionInfos = this._generateFactoryFunctionInfos(rewrittenAdditionalFunctions);
    for (let [funcBody, instances] of functionEntries) {
      let functionInfo = this.residualFunctionInfos.get(funcBody);
      invariant(functionInfo);
      let { unbound, modified, usesThis } = functionInfo;
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
        this.statistics.functionClones += instancesToSplice.length - 1;

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
              let methodBody = ((t.cloneDeep(funcBody): any): BabelNodeBlockStatement);
              // create the class method AST
              let classMethod = t.classMethod(
                methodType,
                classMethodKeyNode,
                methodParams,
                methodBody,
                classMethodComputed,
                classMethodIsStatic
              );
              // traverse and replace refs in the class method
              traverse(
                t.file(
                  t.program([t.expressionStatement(t.classExpression(null, null, t.classBody([classMethod]), []))])
                ),
                ClosureRefReplacer,
                null,
                {
                  residualFunctionBindings,
                  modified,
                  requireReturns: this.requireReturns,
                  requireStatistics,
                  getModuleIdIfNodeIsRequireFunction: this.modules.getGetModuleIdIfNodeIsRequireFunction(methodParams, [
                    functionValue,
                  ]),
                  factoryFunctionInfos,
                }
              );
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
            let funcParams = params.slice();
            funcOrClassNode = t.functionExpression(
              null,
              funcParams,
              ((t.cloneDeep(funcBody): any): BabelNodeBlockStatement)
            );
            let scopeInitialization = [];
            for (let [scopeName, scope] of scopeInstances) {
              scopeInitialization.push(
                t.variableDeclaration("var", [
                  t.variableDeclarator(t.identifier(scopeName), t.numericLiteral(scope.id)),
                ])
              );
              scopeInitialization = scopeInitialization.concat(
                this.referentializer.getReferentializedScopeInitialization(scope)
              );
            }
            funcOrClassNode.body.body = scopeInitialization.concat(funcOrClassNode.body.body);

            traverse(t.file(t.program([t.expressionStatement(funcOrClassNode)])), ClosureRefReplacer, null, {
              residualFunctionBindings,
              modified,
              requireReturns: this.requireReturns,
              requireStatistics,
              getModuleIdIfNodeIsRequireFunction: this.modules.getGetModuleIdIfNodeIsRequireFunction(funcParams, [
                functionValue,
              ]),
              factoryFunctionInfos,
            });
          }
          let id = this.locationService.getLocation(functionValue);
          invariant(id !== undefined);

          if (functionValue.$Strict) {
            strictFunctionBodies.push(funcOrClassNode);
          } else {
            unstrictFunctionBodies.push(funcOrClassNode);
          }
          invariant(id !== undefined);
          invariant(funcOrClassNode !== undefined);
          defineFunction(instance, id, funcOrClassNode);
        }
      };

      if (additionalFunctionNestedInstances.length > 0) naiveProcessInstances(additionalFunctionNestedInstances);
      if (!this._shouldUseFactoryFunction(funcBody, normalInstances)) {
        naiveProcessInstances(normalInstances);
      } else if (normalInstances.length > 0) {
        const functionUniqueTag = ((funcBody: any): FunctionBodyAstNode).uniqueOrderedTag;
        invariant(functionUniqueTag);
        const factoryInfo = factoryFunctionInfos.get(functionUniqueTag);
        invariant(factoryInfo);
        const { factoryId } = factoryInfo;

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
        for (let [scopeName, scope] of normalInstances[0].scopeInstances) {
          factoryParams.push(t.identifier(scopeName));
          scopeInitialization = scopeInitialization.concat(
            this.referentializer.getReferentializedScopeInitialization(scope)
          );
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
          getModuleIdIfNodeIsRequireFunction: this.modules.getGetModuleIdIfNodeIsRequireFunction(
            factoryParams,
            normalInstances.map(instance => instance.functionValue)
          ),
          factoryFunctionInfos,
        });

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
          for (let entry of instance.scopeInstances) {
            flatArgs.push(t.numericLiteral(entry[1].id));
          }
          let funcNode;
          let firstUsage = this.firstFunctionUsages.get(functionValue);
          invariant(insertionPoint !== undefined);
          if (
            // The same free variables in shared instances may refer to objects with different initialization values
            // so a stub forward function is needed during delay initializations.
            this.residualFunctionInitializers.hasInitializerStatement(functionValue) ||
            usesThis ||
            hasFunctionArg ||
            (firstUsage !== undefined && !firstUsage.isNotEarlierThan(insertionPoint)) ||
            this.functionPrototypes.get(functionValue) !== undefined ||
            this.simpleClosures
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

    for (let referentializationScope of this.referentializer.referentializationState.keys()) {
      let prelude = this.prelude;
      // Get the prelude for this additional function value
      if (referentializationScope !== "GLOBAL") {
        let additionalFunction = referentializationScope;
        prelude = getOrDefault(additionalFunctionPreludes, additionalFunction, () => []);
      }
      prelude.unshift(this.referentializer.createCaptureScopeAccessFunction(referentializationScope));
      prelude.unshift(this.referentializer.createCapturedScopesArrayInitialization(referentializationScope));
    }

    for (let instance of this.functionInstances.reverse()) {
      let functionBody = functionBodies.get(instance);
      if (functionBody !== undefined) {
        let insertionPoint = instance.insertionPoint;
        invariant(insertionPoint instanceof BodyReference);
        // v8 seems to do something clever with array splicing, so this potentially
        // expensive operations seems to be actually cheap.
        Array.prototype.splice.apply(
          insertionPoint.body.entries,
          ([insertionPoint.index, 0]: Array<any>).concat((functionBody: Array<any>))
        );
      }
    }

    for (let [additionalFunction, body] of Array.from(rewrittenAdditionalFunctions.entries()).reverse()) {
      let additionalFunctionInfo = this.additionalFunctionValueInfos.get(additionalFunction);
      invariant(additionalFunctionInfo);
      // Modified bindings initializers of optimized function
      let bodySegment = additionalFunctionModifiedBindingsSegment.get(additionalFunction);
      // initializers from Referentialization
      let initializationStatements = getFunctionBody(additionalFunctionInfo.instance);
      let prelude = additionalFunctionPreludes.get(additionalFunction);
      let insertionPoint = additionalFunctionInfo.instance.insertionPoint;
      invariant(insertionPoint);
      // TODO: I think this inserts things in the wrong place
      Array.prototype.splice.apply(
        insertionPoint.body.entries,
        ([insertionPoint.index, 0]: Array<any>).concat((initializationStatements: Array<any>))
      );
      if (bodySegment) body.unshift(...bodySegment);
      if (prelude) body.unshift(...prelude);
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
