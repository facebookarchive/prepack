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
import { Get } from "../methods/index.js";
import invariant from "../invariant.js";
import { flowAnnotationToObjectTypeTemplate } from "../flow/utils.js";
import { computeBinary } from "../evaluators/BinaryExpression.js";
import * as t from "babel-types";
import type { BabelNodeIdentifier } from "babel-types";
import { createAbstractObject } from "../flow/abstractObjectFactories.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";

// Branch status is used for when Prepack returns an abstract value from a render
// that results in a conditional path occuring. This can be problematic for reconcilation
// as the reconciler then needs to understand if this is the start of a new branch, or if
// it's actually deep into an existing branch. If it's a new branch, we need to apply
// keys to the root JSX element so that it keeps it identity (because we're folding trees).
// Furthermore, we also need to bail-out of folding class components where they have lifecycle
// events, as we can't merge lifecycles of mutliple trees when branched reliably
type BranchStatusEnum = "NO_BRANCH" | "NEW_BRANCH" | "BRANCH";

// ExpectedBailOut is like an error, that gets thrown during the reconcilation phase
// allowing the reconcilation to continue on other branches of the tree, the message
// given to ExpectedBailOut will be assigned to the value.$BailOutReason property and serialized
// as a comment in the output source to give the user hints as to what they need to do
// to fix the bail-out case
class ExpectedBailOut {
  message: string;
  constructor(message: string) {
    this.message = message;
  }
}

function getInitialProps(realm: Realm, componentType: ECMAScriptSourceFunctionValue): ObjectValue | AbstractValue {
  let propsName = null;
  let propTypes = null;
  if (valueIsClassComponent(realm, componentType)) {
    // it's a class component, so we need to check the type on for props of the component prototype
    // as we don't support class components yet, throw a fatal error
    throw new ExpectedBailOut("class components not yet supported");
  } else {
    // otherwise it's a functional component, where the first paramater of the function is "props" (if it exists)
    if (componentType.$FormalParameters.length > 0) {
      let firstParam = componentType.$FormalParameters[0];
      if (t.isIdentifier(firstParam)) {
        propsName = ((firstParam: any): BabelNodeIdentifier).name;
      }
      let propsTypeAnnotation = firstParam.typeAnnotation !== undefined && firstParam.typeAnnotation;
      // we expect that if there's a props paramater, it should always have Flow annotations
      if (!propsTypeAnnotation) {
        throw new ExpectedBailOut(`root component missing Flow type annotations for the "props" paramater`);
      }
      propTypes = flowAnnotationToObjectTypeTemplate(propsTypeAnnotation);
    }
  }
  return createAbstractObject(realm, propsName, propTypes);
}

function getInitialContext(realm: Realm, componentType: ECMAScriptSourceFunctionValue): ObjectValue | AbstractValue {
  let contextName = null;
  let contextTypes = null;
  if (valueIsClassComponent(realm, componentType)) {
    // it's a class component, so we need to check the type on for context of the component prototype
    // as we don't support class components yet, throw a fatal error
    throw new ExpectedBailOut("class components not yet supported");
  } else {
    // otherwise it's a functional component, where the second paramater of the function is "context" (if it exists)
    if (componentType.$FormalParameters.length > 1) {
      let secondParam = componentType.$FormalParameters[1];
      if (t.isIdentifier(secondParam)) {
        contextName = ((secondParam: any): BabelNodeIdentifier).name;
      }
      let contextTypeAnnotation = secondParam.typeAnnotation !== undefined && secondParam.typeAnnotation;
      // we expect that if there's a context param, it should always have Flow annotations
      if (!contextTypeAnnotation) {
        throw new ExpectedBailOut(`root component missing Flow type annotations for the "context" paramater`);
      }
      contextTypes = flowAnnotationToObjectTypeTemplate(contextTypeAnnotation);
    }
  }
  return createAbstractObject(realm, contextName, contextTypes);
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
    return this.realm.wrapInGlobalEnv(() =>
      // TODO: (sebmarkbage): You could use the return value of this to detect if there are any mutations on objects other
      // than newly created ones. Then log those to the error logger. That'll help us track violations in
      // components. :)
      this.realm.evaluateForEffects(() => {
        // initialProps and initialContext are created from Flow types from:
        // - if a functional component, the 1st and 2nd paramater of function
        // - if a class component, use this.props and this.context
        // if there are no Flow types for props or context, we will throw a
        // FatalError, unless it's a functional component that has no paramater
        // i.e let MyComponent = () => <div>Hello world</div>
        try {
          let initialProps = getInitialProps(this.realm, componentType);
          let initialContext = getInitialContext(this.realm, componentType);
          let { result } = this._renderAsDeepAsPossible(componentType, initialProps, initialContext, "NO_BRANCH");
          this.statistics.optimizedTrees++;
          return result;
        } catch (error) {
          // if there was a bail-out on the root component in this reconcilation process, then this
          // should be an invariant as the user has explicitly asked for this component to get folded
          if (error instanceof ExpectedBailOut) {
            let diagnostic = new CompilerDiagnostic(
              `__registerReactComponentRoot() failed due to - ${error.message}`,
              this.realm.currentLocation,
              "PP0019",
              "FatalError"
            );
            this.realm.handleError(diagnostic);
            throw new FatalError();
          }
          throw error;
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
    let { value, childContext } = this._renderOneLevel(componentType, props, context, branchStatus);
    let result = this._resolveDeeply(value, childContext, branchStatus);
    return {
      result,
      childContext,
    };
  }
  _renderOneLevel(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractValue,
    context: ObjectValue | AbstractValue,
    branchStatus: BranchStatusEnum
  ) {
    if (valueIsClassComponent(this.realm, componentType)) {
      // for now we don't support class components, so we throw a ExpectedBailOut
      throw new ExpectedBailOut("class components not yet supported");
    } else {
      invariant(componentType.$Call, "Expected componentType to be a FunctionValue with $Call method");
      let value = componentType.$Call(this.realm.intrinsics.undefined, [props, context]);
      return { value, childContext: context };
    }
  }
  _applyBranchedLogic(value: ObjectValue) {
    // we need to apply a key when we're branched
    let currentKeyValue = Get(this.realm, value, "key") || this.realm.intrinsics.null;
    let uniqueKey = getUniqueReactElementKey("", this.reactSerializerState.usedReactElementKeys);
    let newKeyValue = new StringValue(this.realm, uniqueKey);
    if (currentKeyValue !== this.realm.intrinsics.null) {
      newKeyValue = computeBinary(this.realm, "+", currentKeyValue, newKeyValue);
    }
    // TODO: This might not be safe in DEV because these objects are frozen (Object.freeze).
    // We should probably go behind the scenes in this case to by-pass that.
    value.$Set("key", newKeyValue, value);
    return value;
  }
  _updateBranchStatus(branchStatus: BranchStatusEnum): BranchStatusEnum {
    if (branchStatus === "NEW_BRANCH") {
      branchStatus = "BRANCH";
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
      // TODO investigate what other kinds might be safe to deeply resolve
      for (let i = 0; i < value.args.length; i++) {
        value.args[i] = this._resolveDeeply(value.args[i], context, "NEW_BRANCH");
      }
      return value;
    }
    // TODO investigate what about other iterables type objects
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
            // if the descriptor is undefined, the property is likely deleted, if it exists
            // proceed to resolve the children
            if (childrenPropertyDescriptor !== undefined) {
              let childrenPropertyValue = childrenPropertyDescriptor.value;
              invariant(childrenPropertyValue instanceof Value, `Bad "children" prop passed in JSXElement`);
              let resolvedChildren = this._resolveDeeply(childrenPropertyValue, context, branchStatus);
              childrenPropertyDescriptor.value = resolvedChildren;
            }
          }
        }
        return value;
      }
      // we do not support "ref" on <Component /> ReactElements
      if (!(refValue instanceof NullValue)) {
        this._assignBailOutMessage(value, `Bail-out: refs are not supported on <Components />`);
        return value;
      }
      if (!(propsValue instanceof ObjectValue || propsValue instanceof AbstractValue)) {
        this._assignBailOutMessage(
          value,
          `Bail-out: props on <Component /> was not not an ObjectValue or an AbstractValue`
        );
        return value;
      }
      if (!(typeValue instanceof ECMAScriptSourceFunctionValue)) {
        this._assignBailOutMessage(value, `Bail-out: type on <Component /> was not a ECMAScriptSourceFunctionValue`);
        return value;
      }
      try {
        let { result } = this._renderAsDeepAsPossible(
          typeValue,
          propsValue,
          context,
          this._updateBranchStatus(branchStatus) // reduce branch status a value if possible
        );
        if (result instanceof UndefinedValue) {
          this._assignBailOutMessage(value, `Bail-out: undefined was returned from render`);
          return branchStatus === "NEW_BRANCH" ? this._applyBranchedLogic(value) : value;
        }
        this.statistics.inlinedComponents++;
        if (branchStatus === "NEW_BRANCH" && result instanceof ObjectValue && isReactElement(result)) {
          return this._applyBranchedLogic(result);
        }
        return result;
      } catch (error) {
        // assign a bail out message
        if (error instanceof ExpectedBailOut) {
          this._assignBailOutMessage(value, "Bail-out: " + error.message);
        } else if (error instanceof FatalError) {
          this._assignBailOutMessage(value, "Evaluation bail-out");
        } else {
          throw error;
        }
        // a child component bailed out during component folding, so return the function value and continue
        return branchStatus === "NEW_BRANCH" ? this._applyBranchedLogic(value) : value;
      }
    } else {
      throw new ExpectedBailOut("unsupported value type during reconcilation");
    }
  }
  _assignBailOutMessage(value: ObjectValue, message: string): void {
    // $BailOutReason is a field on ObjectValue that allows us to specify a message
    // that gets serialized as a comment node during the ReactElement serialization stage
    if (value.$BailOutReason !== undefined) {
      // merge bail out messages if one already exists
      value.$BailOutReason += `, ${message}`;
    } else {
      value.$BailOutReason = message;
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
