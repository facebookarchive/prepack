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
  BabelNodeFunctionDeclaration,
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
  hoistedBody: Array<BabelNodeStatement>,
  unstrictFunctionBodies: Array<BabelNodeFunctionDeclaration>,
  strictFunctionBodies: Array<BabelNodeFunctionDeclaration>,
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

  _referentialize(names: Names, instances: Array<FunctionInstance>): void {
    for (let instance of instances) {
      let serializedBindings = instance.serializedBindings;

      for (let name in names) {
        let serializedBinding = serializedBindings[name];
        invariant(serializedBinding !== undefined);
        if (serializedBinding.modified) {
          // Initialize captured scope at function call instead of globally
          if (!serializedBinding.referentialized) {
            let scope = this._getSerializedBindingScopeInstance(serializedBinding);
            // Save the serialized value for initialization at the top of
            // the factory.
            // This can serialize more variables than are necessary to execute
            // the function because every function serializes every
            // modified variable of its parent scope. In some cases it could be
            // an improvement to split these variables into multiple
            // scopes.
            invariant(serializedBinding.serializedValue);
            scope.initializationValues.set(name, serializedBinding.serializedValue);

            // Replace binding usage with scope references
            serializedBinding.serializedValue = t.memberExpression(
              t.memberExpression(this.capturedScopesArray, t.identifier(scope.name), true),
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

  _getReferentializedScopeInitialization(scope: ScopeBinding): BabelNodeIfStatement {
    let properties = [];
    for (let [variableName, value] of scope.initializationValues.entries()) {
      properties.push(t.objectProperty(t.identifier(variableName), value));
    }

    return t.ifStatement(
      t.unaryExpression("!", t.memberExpression(this.capturedScopesArray, t.identifier(scope.name), true)),
      t.expressionStatement(
        t.assignmentExpression(
          "=",
          t.memberExpression(this.capturedScopesArray, t.identifier(scope.name), true),
          t.objectExpression(properties)
        )
      )
    );
  }

  spliceFunctions(): ResidualFunctionsResult {
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
    let hoistedBody = [];
    let unstrictFunctionBodies = [];
    let strictFunctionBodies = [];
    let funcNodes: Map<FunctionValue, BabelNodeFunctionDeclaration | BabelNodeVariableDeclaration> = new Map();

    for (let [funcBody, instances] of functionEntries) {
      let functionInfo = this.residualFunctionInfos.get(funcBody);
      invariant(functionInfo);
      this._referentialize(functionInfo.names, instances);
    }

    for (let [funcBody, instances] of functionEntries) {
      let functionInfo = this.residualFunctionInfos.get(funcBody);
      invariant(functionInfo);
      let { names, modified, usesThis, usesArguments } = functionInfo;
      let params = instances[0].functionValue.$FormalParameters;
      invariant(params !== undefined);

      let shouldInline = !funcBody;
      if (!shouldInline && funcBody.start && funcBody.end) {
        let bodySize = funcBody.end - funcBody.start;
        shouldInline = bodySize <= 30;
      }

      let define = (instance, funcNode) => {
        let body = funcNode.type === "FunctionDeclaration" ? hoistedBody : getFunctionBody(instance);
        body.push(funcNode);
        let { functionValue } = instance;
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
        funcNodes.set(functionValue, funcNode);
      };

      if (shouldInline || instances.length === 1 || usesArguments) {
        this.statistics.functionClones += instances.length - 1;

        for (let instance of instances) {
          let { functionValue, serializedBindings, scopeInstances } = instance;
          let id = this.locationService.getLocation(functionValue);
          invariant(id !== undefined);
          let funcParams = params.slice();
          let funcNode = t.functionDeclaration(id, funcParams, ((t.cloneDeep(funcBody): any): BabelNodeBlockStatement));
          let scopeInitialization = [];
          for (let scope of scopeInstances) {
            scopeInitialization.push(
              t.variableDeclaration("var", [t.variableDeclarator(t.identifier(scope.name), t.numericLiteral(scope.id))])
            );
            scopeInitialization.push(this._getReferentializedScopeInitialization(scope));
          }
          funcNode.body.body = scopeInitialization.concat(funcNode.body.body);

          traverse(t.file(t.program([funcNode])), ClosureRefReplacer, null, {
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

          define(instance, funcNode);
        }
      } else {
        // Group instances with modified bindings
        let instanceBatches = [instances];
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
          for (let name in names) {
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
            scopeInitialization.push(this._getReferentializedScopeInitialization(scope));
          }

          factoryParams = factoryParams.concat(params).slice();

          // The Replacer below mutates the AST, so let's clone the original AST to avoid modifying it
          let factoryNode = t.functionDeclaration(
            factoryId,
            factoryParams,
            ((t.cloneDeep(funcBody): any): BabelNodeBlockStatement)
          );

          factoryNode.body.body = scopeInitialization.concat(factoryNode.body.body);

          // factory functions do not depend on any nested generator scope, so they go to the prelude
          this.prelude.push(factoryNode);

          traverse(t.file(t.program([factoryNode])), ClosureRefReplacer, null, {
            serializedBindings: sameSerializedBindings,
            modified,
            requireReturns: this.requireReturns,
            requireStatistics,
            isRequire: this.modules.getIsRequire(factoryParams, instances.map(instance => instance.functionValue)),
          });

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
            let node;
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

              node = t.functionDeclaration(functionId, params, childBody);
            } else {
              node = t.variableDeclaration("var", [
                t.variableDeclarator(
                  functionId,
                  t.callExpression(
                    t.memberExpression(factoryId, t.identifier("bind")),
                    [nullExpression].concat(flatArgs)
                  )
                ),
              ]);
            }

            define(instance, node);
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
        invariant(funcNode.type === "FunctionDeclaration");
        let blockStatement: BabelNodeBlockStatement = ((funcNode: any): BabelNodeFunctionDeclaration).body;
        blockStatement.body.unshift(initializerStatement);
      }
    }

    return { hoistedBody, unstrictFunctionBodies, strictFunctionBodies, requireStatistics };
  }
}
