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
import type { FunctionBodyAstNode } from "../types.js";
import type { NameGenerator } from "../utils/generator.js";
import traverse from "babel-traverse";
import invariant from "../invariant.js";
import type { FunctionInfo, FactoryFunctionInfo, FunctionInstance, AdditionalFunctionInfo } from "./types.js";
import { BodyReference, AreSameResidualBinding, SerializerStatistics } from "./types.js";
import { ClosureRefReplacer } from "./visitors.js";
import { Modules } from "./modules.js";
import { ResidualFunctionInitializers } from "./ResidualFunctionInitializers.js";
import { nullExpression } from "../utils/internalizer.js";
import type { LocationService } from "./types.js";
import { Referentializer } from "./Referentializer.js";
import { getOrDefault } from "./utils.js";

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
    this.referentializer = new Referentializer(scopeNameGenerator, statistics);
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
  functionPrototypes: Map<FunctionValue, BabelNodeIdentifier>;
  firstFunctionUsages: Map<FunctionValue, BodyReference>;
  functions: Map<BabelNodeBlockStatement, Array<FunctionInstance>>;
  functionInstances: Array<FunctionInstance>;
  residualFunctionInitializers: ResidualFunctionInitializers;
  residualFunctionInfos: Map<BabelNodeBlockStatement, FunctionInfo>;
  residualFunctionInstances: Map<FunctionValue, FunctionInstance>;
  additionalFunctionValueInfos: Map<FunctionValue, AdditionalFunctionInfo>;
  additionalFunctionValueNestedFunctions: Set<FunctionValue>;
  referentializer: Referentializer;

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
    return !shouldInlineFunction() && instances.length > 1 && !usesArguments;
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
      const suffix = instances[0].functionValue.__originalName || "";
      if (this._shouldUseFactoryFunction(functionBody, instances)) {
        // Rewritten function should never use factory function.
        invariant(!this._hasRewrittenFunctionInstance(rewrittenAdditionalFunctions, instances));
        factoryId = t.identifier(this.factoryNameGenerator.generate(suffix));
      } else {
        // For inline function body case, use the first function as the factory function.
        factoryId = this.locationService.getLocation(instances[0].functionValue);
      }

      const functionUniqueTag = ((functionBody: any): FunctionBodyAstNode).uniqueTag;
      invariant(functionUniqueTag);

      const functionInfo = this.residualFunctionInfos.get(functionBody);
      invariant(functionInfo);
      factoryFunctionInfos.set(functionUniqueTag, { factoryId, functionInfo });
    }
    return factoryFunctionInfos;
  }

  // Preserve residual functions' ordering from original source code.
  // This is necessary to prevent unexpected code locality issues.
  // [Algorithm] sort function based on following criterias:
  // 1. source file alphabetically.
  // 2. start line number.
  // 3. start column number.
  _sortFunctionByOriginalOrdering(functionEntries: Array<[BabelNodeBlockStatement, Array<FunctionInstance>]>): void {
    functionEntries.sort((funcA, funcB) => {
      const funcALocation = funcA[0].loc;
      const funcBLocation = funcB[0].loc;
      if (!funcALocation || !funcBLocation || !funcALocation.source || !funcBLocation.source) {
        // Preserve the current ordering if there is no source location information available.
        return -1;
      }
      if (funcALocation.source !== funcBLocation.source) {
        return funcALocation.source.localeCompare(funcBLocation.source);
      } else if (funcALocation.start.line !== funcBLocation.start.line) {
        return funcALocation.start.line - funcBLocation.start.line;
      } else {
        return funcALocation.start.column - funcBLocation.start.column;
      }
    });
  }

  spliceFunctions(
    rewrittenAdditionalFunctions: Map<FunctionValue, Array<BabelNodeStatement>>
  ): ResidualFunctionsResult {
    this.residualFunctionInitializers.scrubFunctionInitializers();

    let functionBodies = new Map();
    // these need to get spliced in at the end
    let additionalFunctionPreludes = new Map();
    function getFunctionBody(instance: FunctionInstance): Array<BabelNodeStatement> {
      let b = functionBodies.get(instance);
      if (b === undefined) functionBodies.set(instance, (b = []));
      return b;
    }
    let globalPrelude = this.prelude;
    function getPrelude(instance: FunctionInstance): Array<BabelNodeStatement> {
      let additionalFunction = instance.containingAdditionalFunction;
      let b;
      if (additionalFunction) {
        b = additionalFunctionPreludes.get(additionalFunction);
        if (b === undefined) additionalFunctionPreludes.set(additionalFunction, (b = []));
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

    for (let [funcBody, instances] of functionEntries) {
      let functionInfo = this.residualFunctionInfos.get(funcBody);
      invariant(functionInfo);
      this.referentializer.referentialize(
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

    // Emit code for ModifiedBindings for additional functions
    for (let [funcValue, funcInfo] of this.additionalFunctionValueInfos) {
      for (let [, residualBinding] of funcInfo.modifiedBindings) {
        let scope = residualBinding.scope;

        // TODO #989: This should probably be an invariant once captures work properly
        // Currently we don't referentialize bindings in additional functions (but we
        // do for bindings nested in additional functions)
        if (!residualBinding.referentialized) continue;

        // Find the proper prelude to emit to (global vs additional function's prelude)
        let prelude = additionalFunctionPreludes.get(funcValue);
        if (prelude === undefined) additionalFunctionPreludes.set(funcValue, (prelude = []));

        // binding has been referentialized, so setup the scope to be able to
        // access bindings from other __captured_scopes initializers
        if (scope && scope.containingAdditionalFunction !== funcValue) {
          let decl = t.variableDeclaration("var", [
            t.variableDeclarator(t.identifier(scope.name), t.numericLiteral(scope.id)),
          ]);
          let init = this.referentializer.getReferentializedScopeInitialization(scope);
          prelude.push(decl);
          // flow forces me to do this
          Array.prototype.push.apply(prelude, init);
        }

        let newValue = residualBinding.additionalValueSerialized;
        invariant(newValue);
        let binding_reference = ((residualBinding.serializedValue: any): BabelNodeLVal);
        invariant(binding_reference);
        invariant(t.isLVal(binding_reference), "Referentialized values are always LVals");
        // This mutation is safe because it should always be either a global identifier (for global bindings)
        // or an accessor to a referentialized value.
        prelude.push(t.expressionStatement(t.assignmentExpression("=", binding_reference, newValue)));
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
            scopeInitialization = scopeInitialization.concat(
              this.referentializer.getReferentializedScopeInitialization(scope)
            );
          }
          funcNode.body.body = scopeInitialization.concat(funcNode.body.body);

          traverse(t.file(t.program([t.expressionStatement(funcNode)])), ClosureRefReplacer, null, {
            residualFunctionBindings,
            modified,
            requireReturns: this.requireReturns,
            requireStatistics,
            isRequire: this.modules.getIsRequire(funcParams, [functionValue]),
            factoryFunctionInfos,
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
      if (!this._shouldUseFactoryFunction(funcBody, normalInstances)) {
        naiveProcessInstances(normalInstances);
      } else if (normalInstances.length > 0) {
        const functionUniqueTag = ((funcBody: any): FunctionBodyAstNode).uniqueTag;
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
        for (let scope of normalInstances[0].scopeInstances) {
          factoryParams.push(t.identifier(scope.name));
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
          isRequire: this.modules.getIsRequire(factoryParams, normalInstances.map(instance => instance.functionValue)),
          factoryFunctionInfos,
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

    for (let referentializationScope of this.referentializer.referentializationState.keys()) {
      let prelude = this.prelude;
      // Get the prelude for this additional function value
      if (referentializationScope !== "GLOBAL") {
        let additionalFunction = referentializationScope;
        prelude = additionalFunctionPreludes.get(additionalFunction);
        if (!prelude) {
          prelude = [];
          additionalFunctionPreludes.set(additionalFunction, prelude);
        }
      }
      prelude.unshift(this.referentializer.createCaptureScopeAccessFunction(referentializationScope));
      prelude.unshift(this.referentializer.createCapturedScopesArrayInitialization(referentializationScope));
    }

    for (let [additionalFunction, body] of additionalFunctionPreludes.entries()) {
      invariant(additionalFunction);
      let prelude = ((body: any): Array<BabelNodeStatement>);
      let additionalBody = rewrittenAdditionalFunctions.get(additionalFunction);
      invariant(additionalBody);
      additionalBody.unshift(...prelude);
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
