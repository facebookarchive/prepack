/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeCallExpression, BabelNodeSourceLocation } from "babel-types";
import { Completion, PossiblyNormalCompletion } from "../completions.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import invariant from "../invariant.js";
import { type Effects, type PropertyBindings, Realm } from "../realm.js";
import type { PropertyBinding, ReactComponentTreeConfig } from "../types.js";
import { ignoreErrorsIn } from "../utils/errors.js";
import {
  Value,
  AbstractObjectValue,
  FunctionValue,
  ObjectValue,
  AbstractValue,
  ECMAScriptSourceFunctionValue,
  UndefinedValue,
  BoundFunctionValue,
} from "../values/index.js";
import { Generator } from "../utils/generator.js";
import { Get } from "../methods/index.js";
import { ModuleTracer } from "../utils/modules.js";
import {
  ReactStatistics,
  type ReactSerializerState,
  type AdditionalFunctionEffects,
  type ReactEvaluatedNode,
} from "./types";
import { Reconciler, type ComponentTreeState } from "../react/reconcilation.js";
import {
  valueIsClassComponent,
  convertSimpleClassComponentToFunctionalComponent,
  convertFunctionalComponentToComplexClassComponent,
  normalizeFunctionalComponentParamaters,
  getComponentTypeFromRootValue,
  valueIsKnownReactAbstraction,
  createReactEvaluatedNode,
  getComponentName,
  convertConfigObjectToReactComponentTreeConfig,
} from "../react/utils.js";
import * as t from "babel-types";
import { createAbstractArgument } from "../intrinsics/prepack/utils.js";

export class Functions {
  constructor(realm: Realm, moduleTracer: ModuleTracer) {
    this.realm = realm;
    this.moduleTracer = moduleTracer;
    this.writeEffects = new Map();
    this.functionExpressions = new Map();
  }

  realm: Realm;
  // maps back from FunctionValue to the expression string
  functionExpressions: Map<FunctionValue, string>;
  moduleTracer: ModuleTracer;
  writeEffects: Map<FunctionValue, AdditionalFunctionEffects>;

  __generateAdditionalFunctionsMap(globalKey: string) {
    let recordedAdditionalFunctions: Map<
      ECMAScriptSourceFunctionValue | AbstractValue,
      { funcId: string, config?: ReactComponentTreeConfig }
    > = new Map();
    let realm = this.realm;
    let globalRecordedAdditionalFunctionsMap = this.moduleTracer.modules.logger.tryQuery(
      () => Get(realm, realm.$GlobalObject, globalKey),
      realm.intrinsics.undefined
    );
    invariant(globalRecordedAdditionalFunctionsMap instanceof ObjectValue);
    for (let funcId of globalRecordedAdditionalFunctionsMap.getOwnPropertyKeysArray()) {
      let property = globalRecordedAdditionalFunctionsMap.properties.get(funcId);
      if (property) {
        let value = property.descriptor && property.descriptor.value;

        if (value instanceof ECMAScriptSourceFunctionValue) {
          // additional function logic
          recordedAdditionalFunctions.set(value, { funcId });
          continue;
        } else if (value instanceof ObjectValue) {
          // React component tree logic
          let config = Get(realm, value, "config");
          let rootComponent = Get(realm, value, "rootComponent");
          let validConfig = config instanceof ObjectValue || config === realm.intrinsics.undefined;
          let validRootComponent =
            rootComponent instanceof ECMAScriptSourceFunctionValue ||
            (rootComponent instanceof AbstractValue && valueIsKnownReactAbstraction(this.realm, rootComponent));

          if (validConfig && validRootComponent) {
            recordedAdditionalFunctions.set(((rootComponent: any): ECMAScriptSourceFunctionValue | AbstractValue), {
              funcId,
              config: convertConfigObjectToReactComponentTreeConfig(
                realm,
                ((config: any): ObjectValue | UndefinedValue)
              ),
            });
          }
          continue;
        }
        realm.handleError(
          new CompilerDiagnostic(
            `Additional Function Value ${funcId} is an invalid value`,
            undefined,
            "PP0001",
            "FatalError"
          )
        );
        throw new FatalError("invalid Additional Function value");
      }
    }
    return recordedAdditionalFunctions;
  }

  // This will also handle postprocessing for PossiblyNormalCompletion
  _createAdditionalEffects(
    effects: Effects,
    fatalOnAbrupt: boolean,
    name: string,
    environmentRecordIdAfterGlobalCode: number
  ): AdditionalFunctionEffects | null {
    let retValue: AdditionalFunctionEffects = {
      effects,
      transforms: [],
      generator: Generator.fromEffects(effects, this.realm, name, environmentRecordIdAfterGlobalCode),
    };
    return retValue;
  }

  _generateWriteEffectsForReactComponentTree(
    componentType: ECMAScriptSourceFunctionValue,
    effects: Effects,
    componentTreeState: ComponentTreeState,
    evaluatedNode: ReactEvaluatedNode,
    environmentRecordIdAfterGlobalCode: number
  ): void {
    let additionalFunctionEffects = this._createAdditionalEffects(
      effects,
      false,
      "ReactAdditionalFunctionEffects",
      environmentRecordIdAfterGlobalCode
    );
    if (additionalFunctionEffects === null) {
      // TODO we don't support this yet, but will do very soon
      // to unblock work, we'll just return at this point right now
      evaluatedNode.status = "UNSUPPORTED_COMPLETION";
      return;
    }
    let value = effects[0];

    if (value === this.realm.intrinsics.undefined) {
      // if we get undefined, then this component tree failed and a message was already logged
      // in the reconciler
      return;
    }
    if (valueIsClassComponent(this.realm, componentType)) {
      if (componentTreeState.status === "SIMPLE") {
        // if the root component was a class and is now simple, we can convert it from a class
        // component to a functional component
        convertSimpleClassComponentToFunctionalComponent(this.realm, componentType, additionalFunctionEffects);
        normalizeFunctionalComponentParamaters(componentType);
        this.writeEffects.set(componentType, additionalFunctionEffects);
      } else {
        let prototype = Get(this.realm, componentType, "prototype");
        invariant(prototype instanceof ObjectValue);
        let renderMethod = Get(this.realm, prototype, "render");
        invariant(renderMethod instanceof ECMAScriptSourceFunctionValue);
        this.writeEffects.set(renderMethod, additionalFunctionEffects);
      }
    } else {
      if (componentTreeState.status === "COMPLEX") {
        convertFunctionalComponentToComplexClassComponent(
          this.realm,
          componentType,
          componentTreeState.componentType,
          additionalFunctionEffects
        );
        let prototype = Get(this.realm, componentType, "prototype");
        invariant(prototype instanceof ObjectValue);
        let renderMethod = Get(this.realm, prototype, "render");
        invariant(renderMethod instanceof ECMAScriptSourceFunctionValue);
        this.writeEffects.set(renderMethod, additionalFunctionEffects);
      } else {
        normalizeFunctionalComponentParamaters(componentType);
        this.writeEffects.set(componentType, additionalFunctionEffects);
      }
    }
  }

  optimizeReactComponentTreeRoots(
    statistics: ReactStatistics,
    react: ReactSerializerState,
    environmentRecordIdAfterGlobalCode: number
  ): void {
    let logger = this.moduleTracer.modules.logger;
    let recordedReactRootValues = this.__generateAdditionalFunctionsMap("__reactComponentTrees");
    // Get write effects of the components
    if (this.realm.react.verbose) {
      logger.logInformation(`Evaluating ${recordedReactRootValues.size} React component tree roots...`);
    }
    for (let [componentRoot, { config }] of recordedReactRootValues) {
      invariant(config);
      let reconciler = new Reconciler(this.realm, this.moduleTracer.modules.logger, statistics, react, config);
      let componentType = getComponentTypeFromRootValue(this.realm, componentRoot);
      if (componentType === null) {
        continue;
      }
      let evaluatedRootNode = createReactEvaluatedNode("ROOT", getComponentName(this.realm, componentType));
      statistics.evaluatedRootNodes.push(evaluatedRootNode);
      if (reconciler.hasEvaluatedRootNode(componentType, evaluatedRootNode)) {
        continue;
      }
      let componentTreeEffects = reconciler.renderReactComponentTree(componentType, null, null, evaluatedRootNode);
      if (componentTreeEffects === null) {
        if (this.realm.react.verbose) {
          logger.logInformation(`  ✖ ${evaluatedRootNode.name} (root)`);
        }
        continue;
      } else if (this.realm.react.verbose) {
        logger.logInformation(`  ✔ ${evaluatedRootNode.name} (root)`);
      }
      this._generateWriteEffectsForReactComponentTree(
        componentType,
        componentTreeEffects,
        reconciler.componentTreeState,
        evaluatedRootNode,
        environmentRecordIdAfterGlobalCode
      );
      this._optimizeReactComponentTreeBranches(reconciler, environmentRecordIdAfterGlobalCode);
      this._optimizeReactNestedClosures(reconciler, environmentRecordIdAfterGlobalCode);
    }
  }

  _optimizeReactNestedClosures(reconciler: Reconciler, environmentRecordIdAfterGlobalCode: number): void {
    let logger = this.moduleTracer.modules.logger;

    if (this.realm.react.verbose && reconciler.nestedOptimizedClosures.length > 0) {
      logger.logInformation(`    Evaluating nested closures...`);
    }
    for (let {
      func,
      evaluatedNode,
      nestedEffects,
      componentType,
      context,
      branchState,
    } of reconciler.nestedOptimizedClosures) {
      if (reconciler.hasEvaluatedNestedClosure(func)) {
        continue;
      }
      if (func instanceof ECMAScriptSourceFunctionValue && reconciler.hasEvaluatedRootNode(func, evaluatedNode)) {
        continue;
      }
      let closureEffects = reconciler.renderNestedOptimizedClosure(
        func,
        nestedEffects,
        componentType,
        context,
        branchState,
        evaluatedNode
      );
      if (closureEffects === null) {
        if (this.realm.react.verbose) {
          logger.logInformation(`      ✖ function "${getComponentName(this.realm, func)}"`);
        }
        continue;
      } else if (this.realm.react.verbose) {
        logger.logInformation(`      ✔ function "${getComponentName(this.realm, func)}"`);
      }
      let additionalFunctionEffects = this._createAdditionalEffects(
        closureEffects,
        true,
        "ReactNestedAdditionalFunctionEffects",
        environmentRecordIdAfterGlobalCode
      );
      invariant(additionalFunctionEffects);
      if (func instanceof BoundFunctionValue) {
        invariant(func.$BoundTargetFunction instanceof ECMAScriptSourceFunctionValue);
        this.writeEffects.set(func.$BoundTargetFunction, additionalFunctionEffects);
      } else {
        this.writeEffects.set(func, additionalFunctionEffects);
      }
    }
  }

  _optimizeReactComponentTreeBranches(reconciler: Reconciler, environmentRecordIdAfterGlobalCode: number): void {
    let componentTreeState = reconciler.componentTreeState;
    let logger = this.moduleTracer.modules.logger;
    // for now we just use abstract props/context, in the future we'll create a new branch with a new component
    // that used the props/context. It will extend the original component and only have a render method
    for (let { rootValue: branchRootValue, evaluatedNode } of componentTreeState.branchedComponentTrees) {
      let branchComponentType = getComponentTypeFromRootValue(this.realm, branchRootValue);
      if (branchComponentType === null) {
        evaluatedNode.status = "UNKNOWN_TYPE";
        continue;
      }
      // so we don't process the same component multiple times (we might change this logic later)
      if (reconciler.hasEvaluatedRootNode(branchComponentType, evaluatedNode)) {
        continue;
      }
      reconciler.clearComponentTreeState();
      let branchEffects = reconciler.renderReactComponentTree(branchComponentType, null, null, evaluatedNode);
      if (branchEffects === null) {
        if (this.realm.react.verbose) {
          logger.logInformation(`    ✖ ${evaluatedNode.name} (branch)`);
        }
        continue;
      } else if (this.realm.react.verbose) {
        logger.logInformation(`    ✔ ${evaluatedNode.name} (branch)`);
      }
      let branchComponentTreeState = reconciler.componentTreeState;
      this._generateWriteEffectsForReactComponentTree(
        branchComponentType,
        branchEffects,
        branchComponentTreeState,
        evaluatedNode,
        environmentRecordIdAfterGlobalCode
      );
    }
  }

  _generateAdditionalFunctionCallsFromDirective(): Array<[FunctionValue, BabelNodeCallExpression]> {
    let recordedAdditionalFunctions = this.__generateAdditionalFunctionsMap("__optimizedFunctions");

    // The additional functions we registered at runtime are recorded at:
    // global.__optimizedFunctions.id
    let calls = [];
    for (let [funcValue, { funcId }] of recordedAdditionalFunctions) {
      // TODO #987: Make Additional Functions work with arguments
      invariant(funcValue instanceof FunctionValue);
      calls.push([
        funcValue,
        t.callExpression(
          t.memberExpression(
            t.memberExpression(t.identifier("global"), t.identifier("__optimizedFunctions")),
            t.identifier(funcId)
          ),
          []
        ),
      ]);
    }
    return calls;
  }

  _callOfFunction(funcValue: FunctionValue): void => Value {
    const globalThis = this.realm.$GlobalEnv.environmentRecord.WithBaseObject();
    let call = funcValue.$Call;
    invariant(call);
    let numArgs = funcValue.getLength();
    let args = [];
    invariant(funcValue instanceof ECMAScriptSourceFunctionValue);
    let params = funcValue.$FormalParameters;
    if (numArgs && numArgs > 0 && params) {
      for (let parameterId of params) {
        if (t.isIdentifier(parameterId)) {
          // Create an AbstractValue similar to __abstract being called
          args.push(
            createAbstractArgument(
              this.realm,
              ((parameterId: any): BabelNodeIdentifier).name,
              funcValue.expressionLocation
            )
          );
        } else {
          this.realm.handleError(
            new CompilerDiagnostic(
              "Non-identifier args to additional functions unsupported",
              funcValue.expressionLocation,
              "PP1005",
              "FatalError"
            )
          );
          throw new FatalError("Non-identifier args to additional functions unsupported");
        }
      }
    }
    return call.bind(this, globalThis, args);
  }

  checkThatFunctionsAreIndependent(environmentRecordIdAfterGlobalCode: number) {
    let additionalFunctions = this.__generateAdditionalFunctionsMap("__optimizedFunctions");

    for (let [funcValue] of additionalFunctions) {
      invariant(funcValue instanceof ECMAScriptSourceFunctionValue);
      let call = this._callOfFunction(funcValue);
      let effects = this.realm.evaluatePure(() =>
        this.realm.evaluateForEffectsInGlobalEnv(call, undefined, "additional function")
      );
      invariant(effects);
      let additionalFunctionEffects = this._createAdditionalEffects(
        effects,
        true,
        "AdditionalFunctionEffects",
        environmentRecordIdAfterGlobalCode
      );
      invariant(additionalFunctionEffects);
      this.writeEffects.set(funcValue, additionalFunctionEffects);
    }

    // check that functions are independent
    let conflicts: Map<BabelNodeSourceLocation, CompilerDiagnostic> = new Map();
    for (let [fun1] of additionalFunctions) {
      invariant(fun1 instanceof FunctionValue);
      let fun1Name = this.functionExpressions.get(fun1) || fun1.intrinsicName || "(unknown function)";
      // Also do argument validation here
      let additionalFunctionEffects = this.writeEffects.get(fun1);
      invariant(additionalFunctionEffects !== undefined);
      let e1 = additionalFunctionEffects.effects;
      invariant(e1 !== undefined);
      if (e1[0] instanceof Completion && !e1[0] instanceof PossiblyNormalCompletion) {
        let error = new CompilerDiagnostic(
          `Additional function ${fun1Name} may terminate abruptly`,
          e1[0].location,
          "PP1002",
          "FatalError"
        );
        this.realm.handleError(error);
        throw new FatalError();
      }
      for (let [fun2] of additionalFunctions) {
        if (fun1 === fun2) continue;
        invariant(fun2 instanceof FunctionValue);
        this.reportWriteConflicts(fun1Name, conflicts, e1[3], this._callOfFunction(fun2));
      }
    }
    if (conflicts.size > 0) {
      for (let diagnostic of conflicts.values()) this.realm.handleError(diagnostic);
      throw new FatalError();
    }
  }

  getAdditionalFunctionValuesToEffects(): Map<FunctionValue, AdditionalFunctionEffects> {
    return this.writeEffects;
  }

  reportWriteConflicts(
    fname: string,
    conflicts: Map<BabelNodeSourceLocation, CompilerDiagnostic>,
    pbs: PropertyBindings,
    call2: void => Value
  ) {
    let reportConflict = (location: BabelNodeSourceLocation) => {
      let error = new CompilerDiagnostic(
        `Property access conflicts with write in additional function ${fname}`,
        location,
        "PP1003",
        "FatalError"
      );
      conflicts.set(location, error);
    };
    let writtenObjects: Set<ObjectValue | AbstractObjectValue> = new Set();
    pbs.forEach((val, key, m) => {
      writtenObjects.add(key.object);
    });
    let oldReportObjectGetOwnProperties = this.realm.reportObjectGetOwnProperties;
    this.realm.reportObjectGetOwnProperties = (ob: ObjectValue) => {
      let location = this.realm.currentLocation;
      invariant(location);
      if (writtenObjects.has(ob) && !conflicts.has(location)) reportConflict(location);
    };
    let oldReportPropertyAccess = this.realm.reportPropertyAccess;
    this.realm.reportPropertyAccess = (pb: PropertyBinding) => {
      let location = this.realm.currentLocation;
      if (!location) return; // happens only when accessing an additional function property
      if (pbs.has(pb) && !conflicts.has(location)) reportConflict(location);
    };
    try {
      ignoreErrorsIn(this.realm, () => this.realm.evaluateForEffectsInGlobalEnv(call2));
    } finally {
      this.realm.reportPropertyAccess = oldReportPropertyAccess;
      this.realm.reportObjectGetOwnProperties = oldReportObjectGetOwnProperties;
    }
  }
}
