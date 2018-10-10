/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm } from "../realm.js";
import {
  AbstractValue,
  BoundFunctionValue,
  ECMAScriptSourceFunctionValue,
  ObjectValue,
  AbstractObjectValue,
  SymbolValue,
  NativeFunctionValue,
  ECMAScriptFunctionValue,
  Value,
} from "../values/index.js";
import * as t from "@babel/types";
import type { BabelNodeIdentifier } from "@babel/types";
import {
  flagPropsWithNoPartialKeyOrRef,
  getProperty,
  getValueFromFunctionCall,
  hardModifyReactObjectPropertyBinding,
  valueIsClassComponent,
} from "./utils.js";
import { ExpectedBailOut, SimpleClassBailOut } from "./errors.js";
import { Get, Construct } from "../methods/index.js";
import { Properties } from "../singletons.js";
import invariant from "../invariant.js";
import traverse from "@babel/traverse";
import type { ClassComponentMetadata, ReactComponentTreeConfig } from "../types.js";
import type { ReactEvaluatedNode } from "../serializer/types.js";
import { FatalError } from "../errors.js";
import { type ComponentModel, ShapeInformation } from "../utils/ShapeInformation.js";
import { PropertyDescriptor } from "../descriptors.js";

const lifecycleMethods = new Set([
  "componentWillUnmount",
  "componentDidMount",
  "componentWillMount",
  "componentDidUpdate",
  "componentWillUpdate",
  "componentDidCatch",
  "componentWillReceiveProps",
]);

const whitelistedProperties = new Set(["props", "context", "refs", "setState"]);

export function getInitialProps(
  realm: Realm,
  componentType: ECMAScriptSourceFunctionValue | BoundFunctionValue | null,
  { modelString }: ReactComponentTreeConfig
): AbstractObjectValue {
  let componentModel = modelString !== undefined ? (JSON.parse(modelString): ComponentModel) : undefined;
  let shape = ShapeInformation.createForReactComponentProps(componentModel);
  let propsName = null;
  if (componentType !== null) {
    if (valueIsClassComponent(realm, componentType)) {
      propsName = "this.props";
    } else {
      let formalParameters;
      if (componentType instanceof BoundFunctionValue) {
        invariant(componentType.$BoundTargetFunction instanceof ECMAScriptSourceFunctionValue);
        formalParameters = componentType.$BoundTargetFunction.$FormalParameters;
      } else {
        formalParameters = componentType.$FormalParameters;
      }
      // otherwise it's a functional component, where the first paramater of the function is "props" (if it exists)
      if (formalParameters.length > 0) {
        let firstParam = formalParameters[0];
        if (t.isIdentifier(firstParam)) {
          propsName = ((firstParam: any): BabelNodeIdentifier).name;
        }
      }
    }
  }
  let abstractPropsObject = AbstractValue.createAbstractObject(realm, propsName || "props", shape);
  invariant(abstractPropsObject instanceof AbstractObjectValue);
  flagPropsWithNoPartialKeyOrRef(realm, abstractPropsObject);
  abstractPropsObject.makeFinal();
  return abstractPropsObject;
}

export function getInitialContext(
  realm: Realm,
  componentType: ECMAScriptSourceFunctionValue | BoundFunctionValue
): AbstractObjectValue {
  let contextName = null;
  if (valueIsClassComponent(realm, componentType)) {
    // it's a class component, so we need to check the type on for context of the component prototype
    let superTypeParameters = componentType.$SuperTypeParameters;
    contextName = "this.context";

    if (superTypeParameters !== undefined) {
      throw new ExpectedBailOut("context on class components not yet supported");
    }
  } else {
    let formalParameters;
    if (componentType instanceof BoundFunctionValue) {
      invariant(componentType.$BoundTargetFunction instanceof ECMAScriptSourceFunctionValue);
      formalParameters = componentType.$BoundTargetFunction.$FormalParameters;
    } else {
      formalParameters = componentType.$FormalParameters;
    }
    // otherwise it's a functional component, where the second paramater of the function is "context" (if it exists)
    if (formalParameters.length > 1) {
      let secondParam = formalParameters[1];
      if (t.isIdentifier(secondParam)) {
        contextName = ((secondParam: any): BabelNodeIdentifier).name;
      }
    }
  }
  let value = AbstractValue.createAbstractObject(realm, contextName || "context");
  return value;
}

function visitClassMethodAstForThisUsage(realm: Realm, method: ECMAScriptSourceFunctionValue): void {
  let formalParameters = method.$FormalParameters;
  let code = method.$ECMAScriptCode;

  traverse(
    t.file(t.program([t.expressionStatement(t.functionExpression(null, formalParameters, code))])),
    {
      ThisExpression(path) {
        let parentNode = path.parentPath.node;

        if (!t.isMemberExpression(parentNode)) {
          throw new SimpleClassBailOut(`possible leakage of independent "this" reference found`);
        }
      },
    },
    null,
    {}
  );
}

export function createSimpleClassInstance(
  realm: Realm,
  componentType: ECMAScriptSourceFunctionValue | BoundFunctionValue,
  props: ObjectValue | AbstractValue,
  context: ObjectValue | AbstractValue
): AbstractObjectValue {
  let componentPrototype = Get(realm, componentType, "prototype");
  invariant(componentPrototype instanceof ObjectValue);
  // create an instance object and disable serialization as we don't want to output the internals we set below
  let instance = new ObjectValue(realm, componentPrototype, "this", true);
  let allowedPropertyAccess = new Set(["props", "context"]);
  for (let [name] of componentPrototype.properties) {
    if (lifecycleMethods.has(name)) {
      // this error will result in the simple class falling back to a complex class
      throw new SimpleClassBailOut("lifecycle methods are not supported on simple classes");
    } else if (name !== "constructor") {
      allowedPropertyAccess.add(name);
      let method = Get(realm, componentPrototype, name);
      if (method instanceof ECMAScriptSourceFunctionValue) {
        visitClassMethodAstForThisUsage(realm, method);
      }
      Properties.Set(realm, instance, name, method, true);
    }
  }
  // assign props
  Properties.Set(realm, instance, "props", props, true);
  // assign context
  Properties.Set(realm, instance, "context", context, true);
  // as this object is simple, we want to check if any access to anything other than
  // "this.props" or "this.context" or methods on the class occur
  let $GetOwnProperty = instance.$GetOwnProperty;
  instance.$GetOwnProperty = P => {
    if (!allowedPropertyAccess.has(P)) {
      // this error will result in the simple class falling back to a complex class
      throw new SimpleClassBailOut("access to basic class instance properties is not supported on simple classes");
    }
    return $GetOwnProperty.call(instance, P);
  };
  // enable serialization to support simple instance variables properties
  instance.refuseSerialization = false;
  // return the instance
  return instance;
}

function deeplyApplyInstancePrototypeProperties(
  realm: Realm,
  instance: ObjectValue,
  componentPrototype: ObjectValue,
  classMetadata: ClassComponentMetadata
) {
  let { instanceProperties, instanceSymbols } = classMetadata;
  let proto = componentPrototype.$Prototype;

  if (proto instanceof ObjectValue && proto !== realm.intrinsics.ObjectPrototype) {
    deeplyApplyInstancePrototypeProperties(realm, instance, proto, classMetadata);
  }

  for (let [name] of componentPrototype.properties) {
    // ensure we don't set properties that were defined on the instance
    if (name !== "constructor" && !instanceProperties.has(name)) {
      Properties.Set(realm, instance, name, Get(realm, componentPrototype, name), true);
    }
  }
  for (let [symbol] of componentPrototype.symbols) {
    // ensure we don't set symbols that were defined on the instance
    if (!instanceSymbols.has(symbol)) {
      Properties.Set(realm, instance, symbol, Get(realm, componentPrototype, symbol), true);
    }
  }
}

export function createClassInstanceForFirstRenderOnly(
  realm: Realm,
  componentType: ECMAScriptSourceFunctionValue | BoundFunctionValue,
  props: ObjectValue | AbstractValue,
  context: ObjectValue | AbstractValue,
  evaluatedNode: ReactEvaluatedNode
): ObjectValue {
  let instance = getValueFromFunctionCall(realm, componentType, realm.intrinsics.undefined, [props, context], true);
  let objectAssign = Get(realm, realm.intrinsics.Object, "assign");
  invariant(objectAssign instanceof ECMAScriptFunctionValue);
  let objectAssignCall = objectAssign.$Call;
  invariant(objectAssignCall !== undefined);

  invariant(instance instanceof ObjectValue);
  instance.refuseSerialization = true;
  // assign props
  Properties.Set(realm, instance, "props", props, true);
  // assign context
  Properties.Set(realm, instance, "context", context, true);
  let state = Get(realm, instance, "state");
  if (state instanceof AbstractObjectValue || state instanceof ObjectValue) {
    state.makeFinal();
  }
  // assign a mocked setState
  let setState = new NativeFunctionValue(realm, undefined, `setState`, 1, (_context, [stateToUpdate, callback]) => {
    invariant(instance instanceof ObjectValue);
    let prevState = Get(realm, instance, "state");
    invariant(prevState instanceof ObjectValue);

    if (stateToUpdate instanceof ECMAScriptSourceFunctionValue && stateToUpdate.$Call) {
      stateToUpdate = stateToUpdate.$Call(instance, [prevState]);
    }
    if (stateToUpdate instanceof ObjectValue) {
      let newState = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
      objectAssignCall(realm.intrinsics.undefined, [newState, prevState]);
      newState.makeFinal();

      for (let [key, binding] of stateToUpdate.properties) {
        if (binding && binding.descriptor) {
          invariant(binding.descriptor instanceof PropertyDescriptor);
          if (binding.descriptor.enumerable) {
            let value = getProperty(realm, stateToUpdate, key);
            hardModifyReactObjectPropertyBinding(realm, newState, key, value);
          }
        }
      }

      Properties.Set(realm, instance, "state", newState, true);
    }
    if (callback instanceof ECMAScriptSourceFunctionValue && callback.$Call) {
      callback.$Call(instance, []);
    }
    return realm.intrinsics.undefined;
  });
  setState.intrinsicName = "(function() {})";
  Properties.Set(realm, instance, "setState", setState, true);

  instance.refuseSerialization = false;
  return instance;
}

export function createClassInstance(
  realm: Realm,
  componentType: ECMAScriptSourceFunctionValue | BoundFunctionValue,
  props: ObjectValue | AbstractValue,
  context: ObjectValue | AbstractValue,
  classMetadata: ClassComponentMetadata
): AbstractObjectValue {
  let componentPrototype = Get(realm, componentType, "prototype");
  invariant(componentPrototype instanceof ObjectValue);
  // create an instance object and disable serialization as we don't want to output the internals we set below
  let instance = new ObjectValue(realm, componentPrototype, "this", true);
  deeplyApplyInstancePrototypeProperties(realm, instance, componentPrototype, classMetadata);

  // assign refs
  Properties.Set(realm, instance, "refs", AbstractValue.createAbstractObject(realm, "this.refs"), true);
  // assign props
  Properties.Set(realm, instance, "props", props, true);
  // assign context
  Properties.Set(realm, instance, "context", context, true);
  // enable serialization to support simple instance variables properties
  instance.refuseSerialization = false;
  // return the instance in an abstract object
  let value = AbstractValue.createAbstractObject(realm, "this", instance);
  invariant(value instanceof AbstractObjectValue);
  return value;
}

export function evaluateClassConstructor(
  realm: Realm,
  constructorFunc: ECMAScriptSourceFunctionValue | BoundFunctionValue,
  props: ObjectValue | AbstractValue | AbstractObjectValue,
  context: ObjectValue | AbstractObjectValue
): { instanceProperties: Set<string>, instanceSymbols: Set<SymbolValue> } {
  let instanceProperties = new Set();
  let instanceSymbols = new Set();

  const funcCall = () =>
    realm.evaluateForEffects(
      () => {
        let instance = Construct(realm, constructorFunc, [props, context]);
        invariant(instance instanceof ObjectValue);
        for (let [propertyName] of instance.properties) {
          if (!whitelistedProperties.has(propertyName)) {
            instanceProperties.add(propertyName);
          }
        }
        for (let [symbol] of instance.symbols) {
          instanceSymbols.add(symbol);
        }
        return instance;
      },
      /*state*/ null,
      `react component constructor: ${constructorFunc.getName()}`
    );

  if (realm.isInPureScope()) {
    funcCall();
  } else {
    realm.evaluateWithPureScope(funcCall);
  }

  return {
    instanceProperties,
    instanceSymbols,
  };
}

export function applyGetDerivedStateFromProps(
  realm: Realm,
  getDerivedStateFromProps: ECMAScriptSourceFunctionValue,
  instance: ObjectValue,
  props: ObjectValue | AbstractValue | AbstractObjectValue
): void {
  let prevState = Get(realm, instance, "state");
  let getDerivedStateFromPropsCall = getDerivedStateFromProps.$Call;
  invariant(getDerivedStateFromPropsCall !== undefined);
  let partialState = getDerivedStateFromPropsCall(realm.intrinsics.null, [props, prevState]);

  const deriveState = state => {
    let objectAssign = Get(realm, realm.intrinsics.Object, "assign");
    invariant(objectAssign instanceof ECMAScriptFunctionValue);
    let objectAssignCall = objectAssign.$Call;
    invariant(objectAssignCall !== undefined);

    if (state instanceof AbstractValue && !(state instanceof AbstractObjectValue)) {
      const kind = state.kind;

      if (kind === "conditional") {
        let condition = state.args[0];
        let a = deriveState(state.args[1]);
        let b = deriveState(state.args[2]);
        invariant(condition instanceof AbstractValue);
        if (a === null && b === null) {
          return null;
        } else if (a === null) {
          invariant(b instanceof Value);
          return AbstractValue.createFromConditionalOp(realm, condition, realm.intrinsics.false, b);
        } else if (b === null) {
          invariant(a instanceof Value);
          return AbstractValue.createFromConditionalOp(realm, condition, a, realm.intrinsics.false);
        } else {
          invariant(a instanceof Value);
          invariant(b instanceof Value);
          return AbstractValue.createFromConditionalOp(realm, condition, a, b);
        }
      } else if (kind === "||" || kind === "&&") {
        let a = deriveState(state.args[0]);
        let b = deriveState(state.args[1]);
        if (b === null) {
          invariant(a instanceof Value);
          return AbstractValue.createFromLogicalOp(realm, kind, a, realm.intrinsics.false);
        } else {
          invariant(a instanceof Value);
          invariant(b instanceof Value);
          return AbstractValue.createFromLogicalOp(realm, kind, a, b);
        }
      } else {
        invariant(state.args !== undefined, "TODO: unknown abstract value passed to deriveState");
        // as the value is completely abstract, we need to add a bunch of
        // operations to be emitted to ensure we do the right thing at runtime
        let a = AbstractValue.createFromBinaryOp(realm, "!==", state, realm.intrinsics.null);
        let b = AbstractValue.createFromBinaryOp(realm, "!==", state, realm.intrinsics.undefined);
        let c = AbstractValue.createFromLogicalOp(realm, "&&", a, b);
        invariant(c instanceof AbstractValue);
        let newState = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
        let preludeGenerator = realm.preludeGenerator;
        invariant(preludeGenerator !== undefined);
        // we cannot use the standard Object.assign as partial state
        // is not simple. however, given getDerivedStateFromProps is
        // meant to be pure, we can assume that there are no getters on
        // the partial abstract state
        AbstractValue.createTemporalObjectAssign(realm, newState, [prevState, state]);
        newState.makeSimple();
        newState.makePartial();
        newState.makeFinal();
        let conditional = AbstractValue.createFromLogicalOp(realm, "&&", c, newState);
        return conditional;
      }
    } else if (state !== realm.intrinsics.null && state !== realm.intrinsics.undefined) {
      let newState = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
      try {
        objectAssignCall(realm.intrinsics.undefined, [newState, prevState, state]);
      } catch (e) {
        if (realm.isInPureScope() && e instanceof FatalError) {
          let preludeGenerator = realm.preludeGenerator;
          invariant(preludeGenerator !== undefined);
          AbstractValue.createTemporalObjectAssign(realm, newState, [prevState, state]);
          newState.makeSimple();
          newState.makePartial();
          return newState;
        }
        throw e;
      }
      newState.makeFinal();
      return newState;
    } else {
      return null;
    }
  };

  let newState = deriveState(partialState);
  if (newState !== null) {
    if (newState instanceof AbstractValue) {
      newState = AbstractValue.createFromLogicalOp(realm, "||", newState, prevState);
    }
    invariant(newState instanceof Value);
    Properties.Set(realm, instance, "state", newState, true);
  }
}
