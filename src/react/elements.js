/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../realm.js";
import {
  AbstractValue,
  AbstractObjectValue,
  ArrayValue,
  ECMAScriptFunctionValue,
  NumberValue,
  ObjectValue,
  Value,
} from "../values/index.js";
import { Create, Properties } from "../singletons.js";
import invariant from "../invariant.js";
import { Get } from "../methods/index.js";
import { flagPropsWithNoPartialKeyOrRef, getProperty, getReactSymbol, hasNoPartialKeyOrRef } from "./utils.js";
import * as t from "babel-types";
import { computeBinary } from "../evaluators/BinaryExpression.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";

function createPropsObject(
  realm: Realm,
  type: Value,
  config: ObjectValue | AbstractObjectValue,
  children: void | Value
): { key: Value, ref: Value, props: ObjectValue | AbstractObjectValue } {
  let defaultProps =
    type instanceof ObjectValue || type instanceof AbstractObjectValue
      ? Get(realm, type, "defaultProps")
      : realm.intrinsics.undefined;

  let props = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  let key = realm.intrinsics.null;
  let ref = realm.intrinsics.null;

  if (!hasNoPartialKeyOrRef(realm, config)) {
    // if either are abstract, this will impact the reconcilation process
    // and ultimately prevent us from folding ReactElements properly
    let diagnostic = new CompilerDiagnostic(
      `unable to evaluate "key" and "ref" on a ReactElement due to an abstract config passed to createElement`,
      realm.currentLocation,
      "PP0025",
      "FatalError"
    );
    realm.handleError(diagnostic);
    if (realm.handleError(diagnostic) === "Fail") throw new FatalError();
  }

  let possibleKey = Get(realm, config, "key");
  if (possibleKey !== realm.intrinsics.null && possibleKey !== realm.intrinsics.undefined) {
    key = computeBinary(realm, "+", realm.intrinsics.emptyString, possibleKey);
  }

  let possibleRef = Get(realm, config, "ref");
  if (possibleRef !== realm.intrinsics.null && possibleRef !== realm.intrinsics.undefined) {
    ref = possibleRef;
  }

  const setProp = (name: string, value: Value): void => {
    if (name !== "__self" && name !== "__source" && name !== "key" && name !== "ref") {
      invariant(props instanceof ObjectValue || props instanceof AbstractObjectValue);
      Properties.Set(realm, props, name, value, true);
    }
  };

  const applyProperties = () => {
    if (config instanceof ObjectValue) {
      for (let [propKey, binding] of config.properties) {
        if (binding && binding.descriptor && binding.descriptor.enumerable) {
          setProp(propKey, Get(realm, config, propKey));
        }
      }
    }
  };

  if (
    (config instanceof AbstractObjectValue && config.isPartialObject()) ||
    (config instanceof ObjectValue && config.isPartialObject() && config.isSimpleObject())
  ) {
    let args = [];
    if (defaultProps !== realm.intrinsics.undefined) {
      args.push(defaultProps);
    }
    args.push(config);
    // create a new props object that will be the target of the Object.assign
    props = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

    // get the global Object.assign
    let globalObj = Get(realm, realm.$GlobalObject, "Object");
    invariant(globalObj instanceof ObjectValue);
    let objAssign = Get(realm, globalObj, "assign");
    invariant(objAssign instanceof ECMAScriptFunctionValue);
    let objectAssignCall = objAssign.$Call;
    invariant(objectAssignCall !== undefined);

    if (children !== undefined) {
      let childrenObject = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
      Properties.Set(realm, props, "children", children, true);
      args.push(childrenObject);
    }

    try {
      objectAssignCall(realm.intrinsics.undefined, [props, ...args]);
    } catch (e) {
      if (realm.isInPureScope() && e instanceof FatalError) {
        props = AbstractValue.createTemporalFromBuildFunction(
          realm,
          ObjectValue,
          [objAssign, props, ...args],
          ([methodNode, ..._args]) => {
            return t.callExpression(methodNode, ((_args: any): Array<any>));
          }
        );
      }
    }
  } else {
    applyProperties();

    if (children !== undefined) {
      setProp("children", children);
    }

    if (defaultProps instanceof ObjectValue) {
      for (let [propKey, binding] of defaultProps.properties) {
        if (binding && binding.descriptor && binding.descriptor.enumerable) {
          if (Get(realm, props, propKey) === realm.intrinsics.undefined) {
            setProp(propKey, Get(realm, defaultProps, propKey));
          }
        }
      }
    } else if (defaultProps instanceof AbstractObjectValue) {
      invariant(false, "TODO: we need to eventually support this");
    }
  }
  invariant(props instanceof ObjectValue || props instanceof AbstractObjectValue);
  // We know the props has no keys because if it did it would have thrown above
  // so we can remove them the props we create.
  flagPropsWithNoPartialKeyOrRef(realm, props);
  // If the object is an object or abstract object value that has a backing object
  // value for a template, we can make them final. We can't make abstract values
  // final though – but that's okay. They also can't be havoced.
  if (props instanceof ObjectValue || (props instanceof AbstractObjectValue && !props.values.isTop())) {
    props.makeFinal();
  }
  return { key, props, ref };
}

function splitReactElementsByConditionalType(
  realm: Realm,
  condValue: AbstractValue,
  consequentVal: Value,
  alternateVal: Value,
  config: ObjectValue | AbstractObjectValue,
  children: void | Value
): Value {
  return realm.evaluateWithAbstractConditional(
    condValue,
    () => {
      return realm.evaluateForEffects(
        () => createReactElement(realm, consequentVal, config, children),
        null,
        "splitReactElementsByConditionalType consequent"
      );
    },
    () => {
      return realm.evaluateForEffects(
        () => createReactElement(realm, alternateVal, config, children),
        null,
        "splitReactElementsByConditionalType alternate"
      );
    }
  );
}

function splitReactElementsByConditionalConfig(
  realm: Realm,
  condValue: AbstractValue,
  consequentVal: Value,
  alternateVal: Value,
  type: Value,
  children: void | Value
): Value {
  return realm.evaluateWithAbstractConditional(
    condValue,
    () => {
      return realm.evaluateForEffects(
        () => createReactElement(realm, type, consequentVal, children),
        null,
        "splitReactElementsByConditionalConfig consequent"
      );
    },
    () => {
      return realm.evaluateForEffects(
        () => createReactElement(realm, type, alternateVal, children),
        null,
        "splitReactElementsByConditionalConfig alternate"
      );
    }
  );
}

export function createReactElement(
  realm: Realm,
  type: Value,
  config: ObjectValue | AbstractObjectValue,
  children: void | Value
): Value {
  if (type instanceof AbstractValue && type.kind === "conditional") {
    let [condValue, consequentVal, alternateVal] = type.args;
    invariant(condValue instanceof AbstractValue);
    return splitReactElementsByConditionalType(realm, condValue, consequentVal, alternateVal, config, children);
  } else if (config instanceof AbstractObjectValue && config.kind === "conditional") {
    let [condValue, consequentVal, alternateVal] = config.args;
    invariant(condValue instanceof AbstractValue);
    return splitReactElementsByConditionalConfig(realm, condValue, consequentVal, alternateVal, type, children);
  }
  let { key, props, ref } = createPropsObject(realm, type, config, children);
  return createInternalReactElement(realm, type, key, ref, props);
}

export function createInternalReactElement(
  realm: Realm,
  type: Value,
  key: Value,
  ref: Value,
  props: ObjectValue | AbstractObjectValue
): ObjectValue {
  let obj = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

  // sanity checks
  if (type instanceof AbstractValue && type.kind === "conditional") {
    invariant(false, "createInternalReactElement should never encounter a conditional type");
  }
  if (key instanceof AbstractValue && key.kind === "conditional") {
    invariant(false, "createInternalReactElement should never encounter a conditional key");
  }
  if (ref instanceof AbstractValue && ref.kind === "conditional") {
    invariant(false, "createInternalReactElement should never encounter a conditional ref");
  }
  if (props instanceof AbstractValue && props.kind === "conditional") {
    invariant(false, "createInternalReactElement should never encounter a conditional props");
  }
  Create.CreateDataPropertyOrThrow(realm, obj, "$$typeof", getReactSymbol("react.element", realm));
  Create.CreateDataPropertyOrThrow(realm, obj, "type", type);
  Create.CreateDataPropertyOrThrow(realm, obj, "key", key);
  Create.CreateDataPropertyOrThrow(realm, obj, "ref", ref);
  Create.CreateDataPropertyOrThrow(realm, obj, "props", props);
  Create.CreateDataPropertyOrThrow(realm, obj, "_owner", realm.intrinsics.null);
  obj.makeFinal();
  return obj;
}

type ElementTraversalVisitor = {
  visitType: (typeValue: Value) => void,
  visitKey: (keyValue: Value) => void,
  visitRef: (keyValue: Value) => void,
  visitAbstractOrPartialProps: (propsValue: AbstractValue | ObjectValue) => void,
  visitConcreteProps: (propsValue: ObjectValue) => void,
  visitChildNode: (childValue: Value) => void,
};

export function traverseReactElement(
  realm: Realm,
  reactElement: ObjectValue,
  traversalVisitor: ElementTraversalVisitor
) {
  let typeValue = getProperty(realm, reactElement, "type");
  traversalVisitor.visitType(typeValue);

  let keyValue = getProperty(realm, reactElement, "key");
  if (keyValue !== realm.intrinsics.null && keyValue !== realm.intrinsics.undefined) {
    traversalVisitor.visitKey(keyValue);
  }

  let refValue = getProperty(realm, reactElement, "ref");
  if (refValue !== realm.intrinsics.null && refValue !== realm.intrinsics.undefined) {
    traversalVisitor.visitRef(refValue);
  }

  let propsValue = getProperty(realm, reactElement, "props");
  if (propsValue instanceof AbstractValue) {
    // visit object, as it's going to be spread
    traversalVisitor.visitAbstractOrPartialProps(propsValue);
  } else if (propsValue instanceof ObjectValue) {
    if (propsValue.isPartialObject()) {
      traversalVisitor.visitAbstractOrPartialProps(propsValue);
    } else {
      traversalVisitor.visitConcreteProps(propsValue);
      // handle children
      if (propsValue.properties.has("children")) {
        let childrenValue = getProperty(realm, propsValue, "children");
        if (childrenValue !== realm.intrinsics.undefined && childrenValue !== realm.intrinsics.null) {
          if (childrenValue instanceof ArrayValue && !childrenValue.intrinsicName) {
            let childrenLength = getProperty(realm, childrenValue, "length");
            let childrenLengthValue = 0;
            if (childrenLength instanceof NumberValue) {
              childrenLengthValue = childrenLength.value;
              for (let i = 0; i < childrenLengthValue; i++) {
                let child = getProperty(realm, childrenValue, "" + i);
                invariant(
                  child instanceof Value,
                  `ReactElement "props.children[${i}]" failed to visit due to a non-value`
                );
                traversalVisitor.visitChildNode(child);
              }
            }
          } else {
            traversalVisitor.visitChildNode(childrenValue);
          }
        }
      }
    }
  }
}
