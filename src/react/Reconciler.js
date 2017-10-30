/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm, type Effects } from "../realm.js";
import { ModuleTracer } from "../serializer/modules.js";
import {
  ECMAScriptSourceFunctionValue,
  Value,
  UndefinedValue,
  StringValue,
  NumberValue,
  BooleanValue,
  NullValue,
  AbstractValue,
  ArrayValue,
  ObjectValue,
} from "../values/index.js";
import { ReactStatistics, type ReactSerializerState } from "../serializer/types.js";
import { isReactElement, getUniqueReactElementKey, valueIsClassComponent } from "./utils";
import { GetValue, Get } from "../methods/index.js";
import invariant from "../invariant.js";
import { flowAnnotationToObjectTypeTemplate } from "../flow/utils.js";
import { computeBinary } from "../evaluators/BinaryExpression.js";
import * as t from "babel-types";
import type { BabelNodeIdentifier } from "babel-types";
import { createAbstractObject } from "../flow/factory.js";

const BranchStatus = {
  NO_BRANCH: "NO_BRANCH",
  NEW_BRANCH: "NEW_BRANCH",
  BRANCH: "BRANCH",
};

type BranchStatusEnum = $Keys<typeof BranchStatus>;

class ExpectedBailOut {
  message: string;
  constructor(message: string) {
    this.message = message;
  }
}

class Reconciler {
  constructor(
    realm: Realm,
    moduleTracer: ModuleTracer,
    statistics: ReactStatistics,
    reactSerializerState: ReactSerializerState
  ) {
    this.realm = realm;
    this.moduleTracer = moduleTracer;
    this.statistics = statistics;
    this.reactSerializerState = reactSerializerState;
  }

  realm: Realm;
  moduleTracer: ModuleTracer;
  statistics: ReactStatistics;
  reactSerializerState: ReactSerializerState;

  render(componentType: ECMAScriptSourceFunctionValue): Effects {
    let propTypes = null;
    let propsName = null;
    let contextTypes = null;
    let contextName = null;
    // we take the first "props" paramater from "function MyComponent (props, context)" and look at its name
    // if its not an Identifier, we leave propsName null so it doesn't get used to create the object
    if (componentType.$FormalParameters.length > 0) {
      if (t.isIdentifier(componentType.$FormalParameters[0])) {
        propsName = ((componentType.$FormalParameters[0]: any): BabelNodeIdentifier).name;
      }
      invariant(
        componentType.$FormalParameters[0].typeAnnotation,
        `__registerReactComponentRoot() failed due to root component missing Flow type annotations for the "props" argument`
      );
      propTypes = flowAnnotationToObjectTypeTemplate(componentType.$FormalParameters[0].typeAnnotation);
    }
    if (componentType.$FormalParameters.length > 1) {
      if (t.isIdentifier(componentType.$FormalParameters[1])) {
        contextName = ((componentType.$FormalParameters[1]: any): BabelNodeIdentifier).name;
      }
      invariant(
        componentType.$FormalParameters[1].typeAnnotation,
        `__registerReactComponentRoot() failed due to root component missing Flow type annotations for the "context" argument`
      );
      contextTypes = flowAnnotationToObjectTypeTemplate(componentType.$FormalParameters[1].typeAnnotation);
    }
    return this.realm.wrapInGlobalEnv(() =>
      this.realm.evaluateForEffects(() => {
        let initialProps = createAbstractObject(this.realm, propsName, propTypes);
        let initialContext = createAbstractObject(this.realm, contextName, contextTypes);
        try {
          let { result } = this._renderAsDeepAsPossible(
            componentType,
            initialProps,
            initialContext,
            BranchStatus.NO_BRANCH
          );
          this.statistics.optimizedTrees++;
          return result;
        } catch (e) {
          invariant(false, "__registerReactComponentRoot() failed due to root component bailing out");
        }
      })
    );
  }
  _renderAsDeepAsPossible(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractValue,
    context: ObjectValue | AbstractValue,
    branchStatus: BranchStatusEnum
  ) {
    let { value, commitDidMountPhase, childContext } = this._renderOneLevel(
      componentType,
      props,
      context,
      branchStatus
    );
    let result = this._resolveDeeply(value, childContext, branchStatus);
    return {
      result,
      childContext,
      commitDidMountPhase,
    };
  }
  _renderOneLevel(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractValue,
    context: ObjectValue | AbstractValue,
    branchStatus: BranchStatusEnum
  ) {
    if (valueIsClassComponent(this.realm, componentType)) {
      // for now we don't support class components, so we bail out
      throw new ExpectedBailOut("class components not yet supported");
    } else {
      invariant(componentType.$Call, "Expected componentType to be a FunctionValue with $Call method");
      let value = componentType.$Call(this.realm.intrinsics.undefined, [props, context]);
      return { value, commitDidMountPhase: null, childContext: context };
    }
  }
  _applyBranchedLogic(value: ObjectValue) {
    // we need to apply a key when we're branched
    let currentKeyValue = Get(this.realm, value, "key") || this.realm.intrinsics.null;
    let uniqueKey = getUniqueReactElementKey("", this.reactSerializerState.usedReactElementKeys);
    let newKeyValue = GetValue(this.realm, this.realm.$GlobalEnv.evaluate(t.stringLiteral(uniqueKey), false));
    if (currentKeyValue !== this.realm.intrinsics.null) {
      newKeyValue = computeBinary(this.realm, "+", currentKeyValue, newKeyValue);
    }
    value.$Set("key", newKeyValue, value);
    return value;
  }
  _updateBranchStatus(branchStatus: BranchStatusEnum): BranchStatusEnum {
    if (branchStatus === BranchStatus.NEW_BRANCH) {
      branchStatus = BranchStatus.BRANCH;
    }
    return branchStatus;
  }
  _resolveDeeply(value: Value, context: ObjectValue | AbstractValue, branchStatus: BranchStatusEnum) {
    if (
      value instanceof StringValue ||
      value instanceof NumberValue ||
      value instanceof BooleanValue ||
      value instanceof NullValue ||
      value instanceof UndefinedValue
    ) {
      // terminal values
      return value;
    } else if (value instanceof AbstractValue) {
      for (let i = 0; i < value.args.length; i++) {
        value.args[i] = this._resolveDeeply(value.args[i], context, BranchStatus.NEW_BRANCH);
      }
      return value;
    }
    if (value instanceof ArrayValue) {
      this._resolveFragment(value, context, branchStatus);
      return value;
    }
    if (value instanceof ObjectValue && isReactElement(value)) {
      let typeValue = Get(this.realm, value, "type");
      let propsValue = Get(this.realm, value, "props");
      let refValue = Get(this.realm, value, "ref");
      if (typeValue instanceof StringValue) {
        // terminal host component. Start evaluating its children.
        if (propsValue instanceof ObjectValue) {
          let childrenProperty = propsValue.properties.get("children");
          if (childrenProperty) {
            let childrenPropertyDescriptor = childrenProperty.descriptor;
            invariant(childrenPropertyDescriptor, "");
            let childrenPropertyValue = childrenPropertyDescriptor.value;
            invariant(childrenPropertyValue instanceof Value, `Bad "children" prop passed in JSXElement`);
            let resolvedChildren = this._resolveDeeply(childrenPropertyValue, context, branchStatus);
            childrenPropertyDescriptor.value = resolvedChildren;
          }
        }
        return value;
      }
      // we do not support "ref" on <Component /> ReactElements
      if (!(refValue instanceof NullValue)) {
        value.$BailOut = `Bail-out: refs are not supported on <Components />`;
        return value;
      }
      if (!(propsValue instanceof ObjectValue || propsValue instanceof AbstractValue)) {
        return value;
      }
      if (!(typeValue instanceof ECMAScriptSourceFunctionValue)) {
        return value;
      }
      try {
        let { result, commitDidMountPhase } = this._renderAsDeepAsPossible(
          typeValue,
          propsValue,
          context,
          this._updateBranchStatus(branchStatus) // reduce branch status a value if possible
        );
        if (result === null || result instanceof UndefinedValue) {
          return branchStatus === BranchStatus.NEW_BRANCH ? this._applyBranchedLogic(value) : value;
        }
        this.statistics.inlinedComponents++;
        if (commitDidMountPhase !== null) {
          commitDidMountPhase();
        }
        if (branchStatus === BranchStatus.NEW_BRANCH && result instanceof ObjectValue && isReactElement(result)) {
          return this._applyBranchedLogic(result);
        }
        return result;
      } catch (error) {
        // assign a bail out message
        if (error instanceof ExpectedBailOut) {
          value.$BailOut = "Bail-out: " + error.message;
        } else {
          value.$BailOut = "Evaluation bail-out";
        }
        // a child component bailed out during component folding, so return the function value and continue
        return branchStatus === BranchStatus.NEW_BRANCH ? this._applyBranchedLogic(value) : value;
      }
    } else {
      return value;
    }
  }
  _resolveFragment(arrayValue: ArrayValue, context: ObjectValue | AbstractValue, branchStatus: BranchStatusEnum) {
    let lengthValue = Get(this.realm, arrayValue, "length");
    invariant(lengthValue instanceof NumberValue, "Invalid children length on JSXElement during reconcilation");
    let length = lengthValue.value;
    for (let i = 0; i < length; i++) {
      let elementProperty = arrayValue.properties.get("" + i);
      let elementPropertyDescriptor = elementProperty && elementProperty.descriptor;
      invariant(elementPropertyDescriptor, `Invalid JSXElement child[${i}] descriptor`);
      let elementValue = elementPropertyDescriptor.value;
      if (elementValue instanceof Value) {
        elementPropertyDescriptor.value = this._resolveDeeply(elementValue, context, branchStatus);
      }
    }
  }
}

export default Reconciler;
