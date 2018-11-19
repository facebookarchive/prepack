/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { type Effects, Realm } from "../realm.js";
import {
  AbstractValue,
  ECMAScriptSourceFunctionValue,
  ObjectValue,
  BoundFunctionValue,
  FunctionValue,
} from "../values/index.js";
import { createAdditionalEffects } from "../serializer/utils.js";
import {
  convertFunctionalComponentToComplexClassComponent,
  convertSimpleClassComponentToFunctionalComponent,
  createNoopFunction,
  createReactEvaluatedNode,
  getComponentName,
  getComponentTypeFromRootValue,
  normalizeFunctionalComponentParamaters,
  valueIsClassComponent,
} from "./utils.js";
import {
  type WriteEffects,
  type ReactEvaluatedNode,
  ReactStatistics,
  type AdditionalFunctionTransform,
} from "../serializer/types.js";
import { Reconciler, type ComponentTreeState } from "./reconcilation.js";
import { ReconcilerFatalError } from "./errors.js";
import { Properties } from "../singletons.js";
import { Get } from "../methods/index.js";
import invariant from "../invariant.js";
import type { ReactComponentTreeConfig } from "../types.js";
import { Logger } from "../utils/logger.js";

function writeEffectsKeyOfComponentValue(
  realm: Realm,
  componentType: ECMAScriptSourceFunctionValue | BoundFunctionValue,
  componentTreeState: ComponentTreeState,
  transforms: Array<AdditionalFunctionTransform>
): FunctionValue {
  if (valueIsClassComponent(realm, componentType)) {
    if (componentTreeState.status === "SIMPLE") {
      // if the root component was a class and is now simple, we can convert it from a class
      // component to a functional component
      if (componentType instanceof BoundFunctionValue) {
        let targetFunction = componentType.$BoundTargetFunction;
        invariant(targetFunction instanceof ECMAScriptSourceFunctionValue);
        convertSimpleClassComponentToFunctionalComponent(realm, targetFunction, transforms);
        normalizeFunctionalComponentParamaters(targetFunction);
        return targetFunction;
      } else {
        convertSimpleClassComponentToFunctionalComponent(realm, componentType, transforms);
        normalizeFunctionalComponentParamaters(componentType);
        return componentType;
      }
    } else {
      let prototype = Get(realm, componentType, "prototype");
      invariant(prototype instanceof ObjectValue);
      let renderMethod = Get(realm, prototype, "render");
      invariant(renderMethod instanceof ECMAScriptSourceFunctionValue);
      return renderMethod;
    }
  } else {
    if (componentTreeState.status === "COMPLEX") {
      convertFunctionalComponentToComplexClassComponent(
        realm,
        componentType,
        componentTreeState.componentType,
        transforms
      );
      let prototype = Get(realm, componentType, "prototype");
      invariant(prototype instanceof ObjectValue);
      let renderMethod = Get(realm, prototype, "render");
      invariant(renderMethod instanceof ECMAScriptSourceFunctionValue);
      return renderMethod;
    } else {
      if (componentType instanceof BoundFunctionValue) {
        let targetFunction = componentType.$BoundTargetFunction;
        invariant(targetFunction instanceof ECMAScriptSourceFunctionValue);
        normalizeFunctionalComponentParamaters(targetFunction);
        return targetFunction;
      } else {
        normalizeFunctionalComponentParamaters(componentType);
        return componentType;
      }
    }
  }
}

function applyWriteEffectsForOptimizedComponent(
  realm: Realm,
  componentType: ECMAScriptSourceFunctionValue | BoundFunctionValue,
  _effects: Effects,
  componentTreeState: ComponentTreeState,
  evaluatedNode: ReactEvaluatedNode,
  writeEffects: WriteEffects,
  preEvaluationComponentToWriteEffectFunction: Map<FunctionValue, FunctionValue>,
  parentOptimizedFunction: FunctionValue | void
): void {
  let effects = _effects;
  let transforms = [];
  let writeEffectsKey = writeEffectsKeyOfComponentValue(realm, componentType, componentTreeState, transforms);
  // NB: Must be done here because its required by cAE
  preEvaluationComponentToWriteEffectFunction.set(componentType, writeEffectsKey);
  let additionalFunctionEffects = createAdditionalEffects(
    realm,
    effects,
    false,
    "ReactAdditionalFunctionEffects",
    writeEffectsKey,
    parentOptimizedFunction,
    transforms
  );
  if (additionalFunctionEffects === null) {
    throw new ReconcilerFatalError(
      `Failed to optimize React component tree for "${evaluatedNode.name}" due to an unsupported completion`,
      evaluatedNode
    );
  }
  effects = additionalFunctionEffects.effects;
  let value = effects.result;

  if (value === realm.intrinsics.undefined) {
    // if we get undefined, then this component tree failed and a message was already logged
    // in the reconciler
    return;
  }
  writeEffects.set(writeEffectsKey, additionalFunctionEffects);
  // apply contextTypes for legacy context
  if (componentTreeState.contextTypes.size > 0) {
    let contextTypes = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
    let noOpFunc = createNoopFunction(realm);
    for (let key of componentTreeState.contextTypes) {
      Properties.Set(realm, contextTypes, key, noOpFunc, true);
    }
    Properties.Set(realm, componentType, "contextTypes", contextTypes, true);
  }
}

function optimizeReactComponentTreeBranches(
  realm: Realm,
  reconciler: Reconciler,
  writeEffects: WriteEffects,
  logger: Logger,
  alreadyEvaluated: Map<ECMAScriptSourceFunctionValue | BoundFunctionValue, ReactEvaluatedNode>,
  preEvaluationComponentToWriteEffectFunction: Map<FunctionValue, FunctionValue>
): void {
  if (realm.react.verbose && reconciler.branchedComponentTrees.length > 0) {
    logger.logInformation(`  Evaluating React component tree branches...`);
  }
  // for now we just use abstract props/context, in the future we'll create a new branch with a new component
  // that used the props/context. It will extend the original component and only have a render method
  for (let { rootValue: branchRootValue, evaluatedNode } of reconciler.branchedComponentTrees) {
    let branchComponentType = getComponentTypeFromRootValue(realm, branchRootValue);
    if (branchComponentType === null) {
      evaluatedNode.status = "UNKNOWN_TYPE";
      continue;
    }
    if (alreadyEvaluated.has(branchComponentType)) {
      return;
    }
    alreadyEvaluated.set(branchComponentType, evaluatedNode);
    reconciler.clearComponentTreeState();
    if (realm.react.verbose) {
      logger.logInformation(`    Evaluating ${evaluatedNode.name} (branch)`);
    }
    let parentOptimizedFunction = realm.currentOptimizedFunction;
    let branchEffects = realm.withNewOptimizedFunction(
      () => reconciler.resolveReactComponentTree(branchComponentType, null, null, evaluatedNode),
      branchComponentType
    );

    if (realm.react.verbose) {
      logger.logInformation(`    ✔ ${evaluatedNode.name} (branch)`);
    }
    let branchComponentTreeState = reconciler.componentTreeState;

    applyWriteEffectsForOptimizedComponent(
      realm,
      branchComponentType,
      branchEffects,
      branchComponentTreeState,
      evaluatedNode,
      writeEffects,
      preEvaluationComponentToWriteEffectFunction,
      parentOptimizedFunction
    );
  }
}

export function optimizeReactComponentTreeRoot(
  realm: Realm,
  componentRoot: ECMAScriptSourceFunctionValue | BoundFunctionValue | AbstractValue,
  config: ReactComponentTreeConfig,
  writeEffects: WriteEffects,
  logger: Logger,
  statistics: ReactStatistics,
  alreadyEvaluated: Map<ECMAScriptSourceFunctionValue | BoundFunctionValue, ReactEvaluatedNode>,
  preEvaluationComponentToWriteEffectFunction: Map<FunctionValue, FunctionValue>
): void {
  let reconciler = new Reconciler(realm, config, alreadyEvaluated, statistics, logger);
  let componentType = getComponentTypeFromRootValue(realm, componentRoot);
  if (componentType === null) {
    return;
  }
  if (alreadyEvaluated.has(componentType)) {
    return;
  }
  let evaluatedRootNode = createReactEvaluatedNode("ROOT", getComponentName(realm, componentType));
  statistics.evaluatedRootNodes.push(evaluatedRootNode);
  alreadyEvaluated.set(componentType, evaluatedRootNode);
  if (realm.react.verbose) {
    logger.logInformation(`  Evaluating ${evaluatedRootNode.name} (root)`);
  }
  let parentOptimizedFunction = realm.currentOptimizedFunction;
  let componentTreeEffects = realm.withNewOptimizedFunction(
    () => reconciler.resolveReactComponentTree(componentType, null, null, evaluatedRootNode),
    componentType
  );
  if (realm.react.verbose) {
    logger.logInformation(`  ✔ ${evaluatedRootNode.name} (root)`);
  }

  applyWriteEffectsForOptimizedComponent(
    realm,
    componentType,
    componentTreeEffects,
    reconciler.componentTreeState,
    evaluatedRootNode,
    writeEffects,
    preEvaluationComponentToWriteEffectFunction,
    parentOptimizedFunction
  );
  let startingComponentTreeBranches = 0;
  do {
    startingComponentTreeBranches = reconciler.branchedComponentTrees.length;
    optimizeReactComponentTreeBranches(
      realm,
      reconciler,
      writeEffects,
      logger,
      alreadyEvaluated,
      preEvaluationComponentToWriteEffectFunction
    );
  } while (startingComponentTreeBranches !== reconciler.branchedComponentTrees.length);
}
