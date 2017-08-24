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
import { FunctionValue } from "../values/index.js";
import * as t from "babel-types";
import type {
  BabelNodeExpression,
  BabelNodeStatement,
  BabelNodeIdentifier,
  BabelNodeBlockStatement,
  BabelNodeLVal,
  BabelNodeSpreadElement,
  BabelNodeFunctionExpression,
  BabelNodeIfStatement,
  BabelNodeVariableDeclaration,
} from "babel-types";
import { NameGenerator } from "../utils/generator.js";
import traverse from "babel-traverse";
import invariant from "../invariant.js";
import type { SerializedBinding, ScopeBinding, FunctionInfo, FunctionInstance, Names } from "./types.js";
import { BodyReference, AreSameSerializedBindings, SerializerStatistics } from "./types.js";
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
    residualFunctionInfos: Map<BabelNodeBlockStatement, FunctionInfo>
  ) {
    this.realm = realm;
    this.statistics = statistics;
    this.modules = modules;
    this.requireReturns = requireReturns;
    this.locationService = locationService;
    this.prelude = prelude;
    this.factoryNameGenerator = factoryNameGenerator;
    this.scopeNameGenerator = scopeNameGenerator;
    this.capturedScopeInstanceIdx = 0;
    this.capturedScopesArray = t.identifier(this.scopeNameGenerator.generate("main"));
    this.serializedScopes = new Map();
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
  }

  realm: Realm;
  modules: Modules;
  statistics: SerializerStatistics;
  requireReturns: Map<number | string, BabelNodeExpression>;
  locationService: LocationService;
  prelude: Array<BabelNodeStatement>;
  factoryNameGenerator: NameGenerator;
  scopeNameGenerator: NameGenerator;
  capturedScopeInstanceIdx: number;
  capturedScopesArray: BabelNodeIdentifier;
  serializedScopes: Map<DeclarativeEnvironmentRecord, ScopeBinding>;
  functionPrototypes: Map<FunctionValue, BabelNodeIdentifier>;
  firstFunctionUsages: Map<FunctionValue, BodyReference>;
  functions: Map<BabelNodeBlockStatement, Array<FunctionInstance>>;
  functionInstances: Array<FunctionInstance>;
  residualFunctionInitializers: ResidualFunctionInitializers;
  residualFunctionInfos: Map<BabelNodeBlockStatement, FunctionInfo>;

  addFunctionInstance(instance: FunctionInstance) {
    this.functionInstances.push(instance);
    let code = instance.functionValue.$ECMAScriptCode;
    invariant(code != null);
    let functionInstances = this.functions.get(code);
    if (functionInstances === undefined) this.functions.set(code, (functionInstances = []));
    functionInstances.push(instance);
  }

  setFunctionPrototype(constructor: FunctionValue, prototypeId: BabelNodeIdentifier) {
    this.functionPrototypes.set(constructor, prototypeId);
  }

  addFunctionUsage(val: FunctionValue, bodyReference: BodyReference) {
    if (!this.firstFunctionUsages.has(val)) this.firstFunctionUsages.set(val, bodyReference);
  }

  _getSerializedBindingScopeInstance(serializedBinding: SerializedBinding): ScopeBinding {
    let declarativeEnvironmentRecord = serializedBinding.declarativeEnvironmentRecord;
    invariant(declarativeEnvironmentRecord);

    let scope = this.serializedScopes.get(declarativeEnvironmentRecord);
    if (!scope) {
      scope = {
        name: this.scopeNameGenerator.generate(),
        id: this.capturedScopeInstanceIdx++,
        initializationValues: new Map(),
      };
      this.serializedScopes.set(declarativeEnvironmentRecord, scope);
    }

    serializedBinding.scope = scope;
    return scope;
  }

  _referentialize(unbound: Names, instances: Array<FunctionInstance>): void {
    for (let instance of instances) {
      let serializedBindings = instance.serializedBindings;

      for (let name in unbound) {
        let serializedBinding = serializedBindings[name];
        invariant(serializedBinding !== undefined);
        if (serializedBinding.modified) {
          // Initialize captured scope at function call instead of globally
          if (!serializedBinding.referentialized) {
            let scope = this._getSerializedBindingScopeInstance(serializedBinding);
            let capturedScope = "__captured" + scope.name;
            // Save the serialized value for initialization at the top of
            // the factory.
            // This can serialize more variables than are necessary to execute
            // the function because every function serializes every
            // modified variable of its parent scope. In some cases it could be
            // an improvement to split these variables into multiple
            // scopes.
            invariant(serializedBinding.serializedValue);
            scope.initializationValues.set(name, serializedBinding.serializedValue);
            scope.capturedScope = capturedScope;

            // Replace binding usage with scope references
            serializedBinding.serializedValue = t.memberExpression(
              t.identifier(capturedScope),
              t.identifier(name),
              false
            );

            serializedBinding.referentialized = true;
            this.statistics.referentialized++;
          }

          // Already referentialized in prior scope
          if (serializedBinding.declarativeEnvironmentRecord) {
            invariant(serializedBinding.scope);
            instance.scopeInstances.add(serializedBinding.scope);
          }
        }
      }
    }
  }

  _getReferentializedScopeInitialization(scope: ScopeBinding): [BabelNodeVariableDeclaration, BabelNodeIfStatement] {
    let properties = [];
    for (let [variableName, value] of scope.initializationValues.entries()) {
      properties.push(t.objectProperty(t.identifier(variableName), value));
    }
    let initExpression = t.memberExpression(this.capturedScopesArray, t.identifier(scope.name), true);
    invariant(scope.capturedScope);
    let capturedScope = scope.capturedScope;
    let capturedScopeId = t.identifier(capturedScope);

    return [
      t.variableDeclaration("var", [t.variableDeclarator(capturedScopeId, initExpression)]),
      t.ifStatement(
        t.unaryExpression("!", capturedScopeId),
        t.expressionStatement(
          t.assignmentExpression(
            "=",
            initExpression,
            t.assignmentExpression("=", capturedScopeId, t.objectExpression(properties))
          )
        )
      ),
    ];
  }

  spliceFunctions(
    rewrittenAdditionalFunctions: Map<FunctionValue, Array<BabelNodeStatement>>
  ): ResidualFunctionsResult {
    this.residualFunctionInitializers.scrubFunctionInitializers();

    let functionBodies = new Map();
    function getFunctionBody(instance: FunctionInstance): Array<BabelNodeStatement> {
      let b = functionBodies.get(instance);
      if (b === undefined) functionBodies.set(instance, (b = []));
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
      // TODO: figure out how referentialization works with additional functions
      let normalFunctionInstances = instances.filter(
        instance => !rewrittenAdditionalFunctions.has(instance.functionValue)
      );
      this._referentialize(functionInfo.unbound, normalFunctionInstances);
    }

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

      let define = (instance, funcId, funcNode) => {
        let { functionValue } = instance;
        let body;
        if (t.isFunctionExpression(funcNode)) {
          funcNodes.set(functionValue, ((funcNode: any): BabelNodeFunctionExpression));
          body = this.prelude;
        } else {
          invariant(t.isCallExpression(funcNode)); // .bind call
          body = getFunctionBody(instance);
        }
        let declaration = t.variableDeclaration("var", [t.variableDeclarator(funcId, funcNode)]);
        body.push(declaration);
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
      // Split instances into normal or additional functions (whose bodies have been rewritten)
      let normalInstances = [];
      let additionalFunctionInstances = [];
      for (let instance of instances) {
        if (rewrittenAdditionalFunctions.has(instance.functionValue)) additionalFunctionInstances.push(instance);
        else normalInstances.push(instance);
      }

      let rewrittenBody = rewrittenAdditionalFunctions.get(instances[0].functionValue);

      // Creates a new function for each instance.
      let naiveProcessInstances = (funcInstances, functionBody, fixupReferences) => {
        this.statistics.functionClones += funcInstances.length - 1;

        for (let instance of funcInstances) {
          let { functionValue, serializedBindings, scopeInstances } = instance;
          let id = this.locationService.getLocation(functionValue);
          invariant(id !== undefined);
          let funcParams = params.slice();
          let funcNode = t.functionExpression(
            null,
            funcParams,
            ((t.cloneDeep(functionBody): any): BabelNodeBlockStatement)
          );
          let scopeInitialization = [];
          for (let scope of scopeInstances) {
            scopeInitialization.push(
              t.variableDeclaration("var", [t.variableDeclarator(t.identifier(scope.name), t.numericLiteral(scope.id))])
            );
            scopeInitialization = scopeInitialization.concat(this._getReferentializedScopeInitialization(scope));
          }
          funcNode.body.body = scopeInitialization.concat(funcNode.body.body);

          if (fixupReferences)
            traverse(t.file(t.program([t.expressionStatement(funcNode)])), ClosureRefReplacer, null, {
              serializedBindings,
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

          define(instance, id, funcNode);
        }
      };

      // rewritten functions shouldn't have references fixed up, and for simplicity we
      // emit their instances in a naive way
      if (rewrittenBody) naiveProcessInstances(additionalFunctionInstances, t.blockStatement(rewrittenBody), false);
      if (normalInstances.length === 0) continue;
      if (shouldInline || normalInstances.length === 1 || usesArguments) {
        naiveProcessInstances(normalInstances, funcBody, true);
      } else {
        // Group instances with modified bindings
        let instanceBatches = [normalInstances];
        for (let name in modified) {
          let newInstanceBatches = [];

          for (let batch of instanceBatches) {
            // Map from representative binding to function instances that use it
            let bindingLookup = new Map();

            for (let functionInstance of batch) {
              let serializedBinding = functionInstance.serializedBindings[name];
              invariant(serializedBinding !== undefined);
              let found = false;
              for (let [binding, group] of bindingLookup.entries()) {
                if (AreSameSerializedBindings(this.realm, serializedBinding, binding)) {
                  group.push(functionInstance);
                  found = true;
                  break;
                }
              }
              if (!found) {
                let matchingInstances = [functionInstance];
                bindingLookup.set(serializedBinding, matchingInstances);
                newInstanceBatches.push(matchingInstances);
              }
            }
          }
          instanceBatches = newInstanceBatches;
        }
        this.statistics.functionClones += instanceBatches.length - 1;

        for (instances of instanceBatches) {
          let suffix = instances[0].functionValue.__originalName || "";
          let factoryId = t.identifier(this.factoryNameGenerator.generate(suffix));

          // filter included variables to only include those that are different
          let factoryNames: Array<string> = [];
          let sameSerializedBindings = Object.create(null);
          for (let name in unbound) {
            let isDifferent = false;
            let lastBinding;

            if (instances[0].serializedBindings[name].modified) {
              // Must modify for traversal
              sameSerializedBindings[name] = instances[0].serializedBindings[name];
              continue;
            }

            for (let { serializedBindings } of instances) {
              let serializedBinding = serializedBindings[name];

              invariant(!serializedBinding.modified);
              if (!lastBinding) {
                lastBinding = serializedBinding;
              } else if (!AreSameSerializedBindings(this.realm, serializedBinding, lastBinding)) {
                isDifferent = true;
                break;
              }
            }

            if (isDifferent) {
              factoryNames.push(name);
            } else {
              invariant(lastBinding);
              sameSerializedBindings[name] = { serializedValue: lastBinding.serializedValue };
            }
          }
          //

          let factoryParams: Array<BabelNodeLVal> = [];
          for (let key of factoryNames) {
            factoryParams.push(t.identifier(key));
          }

          let scopeInitialization = [];
          for (let scope of instances[0].scopeInstances) {
            factoryParams.push(t.identifier(scope.name));
            scopeInitialization = scopeInitialization.concat(this._getReferentializedScopeInitialization(scope));
          }

          factoryParams = factoryParams.concat(params).slice();

          // The Replacer below mutates the AST, so let's clone the original AST to avoid modifying it
          let factoryNode = t.functionExpression(
            null,
            factoryParams,
            ((t.cloneDeep(funcBody): any): BabelNodeBlockStatement)
          );

          factoryNode.body.body = scopeInitialization.concat(factoryNode.body.body);

          // factory functions do not depend on any nested generator scope, so they go to the prelude
          let factoryDeclaration = t.variableDeclaration("var", [t.variableDeclarator(factoryId, factoryNode)]);
          this.prelude.push(factoryDeclaration);

          traverse(t.file(t.program([t.expressionStatement(factoryNode)])), ClosureRefReplacer, null, {
            serializedBindings: sameSerializedBindings,
            modified,
            requireReturns: this.requireReturns,
            requireStatistics,
            isRequire: this.modules.getIsRequire(factoryParams, instances.map(instance => instance.functionValue)),
          });

          // Actually create the functions
          for (let instance of instances) {
            let { functionValue, serializedBindings, insertionPoint } = instance;
            let functionId = this.locationService.getLocation(functionValue);
            invariant(functionId !== undefined);
            let flatArgs: Array<BabelNodeExpression> = factoryNames.map(name => {
              let serializedValue = serializedBindings[name].serializedValue;
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
            } else {
              funcNode = t.callExpression(
                t.memberExpression(factoryId, t.identifier("bind")),
                [nullExpression].concat(flatArgs)
              );
            }

            define(instance, functionId, funcNode);
          }
        }
      }
    }

    if (this.capturedScopeInstanceIdx) {
      let scopeVar = t.variableDeclaration("var", [
        t.variableDeclarator(
          this.capturedScopesArray,
          t.callExpression(t.identifier("Array"), [t.numericLiteral(this.capturedScopeInstanceIdx)])
        ),
      ]);
      // The `scopeVar` must be visible in all scopes.
      this.prelude.unshift(scopeVar);
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

    // Inject initializer code for indexed vars into functions
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
