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
import { ValuesDomain } from "../domains/index.js";
import {
  AbstractValue,
  AbstractObjectValue,
  ArrayValue,
  NullValue,
  NumberValue,
  ObjectValue,
  Value,
} from "../values/index.js";
import { Create, Properties } from "../singletons.js";
import invariant from "../invariant.js";
import { Get } from "../methods/index.js";
import {
  applyObjectAssignConfigsForReactElement,
  createInternalReactElement,
  flagPropsWithNoPartialKeyOrRef,
  hardModifyReactObjectPropertyBinding,
  getProperty,
  hasNoPartialKeyOrRef,
} from "./utils.js";
import * as t from "babel-types";
import { computeBinary } from "../evaluators/BinaryExpression.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";

function createPropsObject(
  realm: Realm,
  type: Value,
  config: ObjectValue | AbstractObjectValue,
  children: void | Value
): { key: Value, ref: Value, props: ObjectValue } {
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
    // if the config has been marked as having no partial key or ref and the possible key
    // is abstract, yet the config doesn't have a key property, then the key can remain null
    let keyNotNeeded =
      hasNoPartialKeyOrRef(realm, config) &&
      possibleKey instanceof AbstractValue &&
      config instanceof ObjectValue &&
      !config.properties.has("key");

    if (!keyNotNeeded) {
      key = computeBinary(realm, "+", realm.intrinsics.emptyString, possibleKey);
    }
  }

  let possibleRef = Get(realm, config, "ref");
  if (possibleRef !== realm.intrinsics.null && possibleRef !== realm.intrinsics.undefined) {
    // if the config has been marked as having no partial key or ref and the possible ref
    // is abstract, yet the config doesn't have a ref property, then the ref can remain null
    let refNotNeeded =
      hasNoPartialKeyOrRef(realm, config) &&
      possibleRef instanceof AbstractValue &&
      config instanceof ObjectValue &&
      !config.properties.has("ref");

    if (!refNotNeeded) {
      ref = possibleRef;
    }
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
    args.push(config);
    // create a new props object that will be the target of the Object.assign
    props = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

    applyObjectAssignConfigsForReactElement(realm, props, args);
    props.makeFinal();

    if (children !== undefined) {
      hardModifyReactObjectPropertyBinding(realm, props, "children", children);
    }

    // handle default props on a partial/abstract config
    if (defaultProps !== realm.intrinsics.undefined) {
      let defaultPropsEvaluated = 0;

      // first see if we can apply all the defaultProps without needing the helper
      if (defaultProps instanceof ObjectValue && !defaultProps.isPartialObject()) {
        for (let [propName, binding] of defaultProps.properties) {
          if (binding.descriptor !== undefined && binding.descriptor.value !== realm.intrinsics.undefined) {
            // see if we have this on our props object
            let propBinding = props.properties.get(propName);
            // if the binding exists and value is abstract, it might be undefined
            // so in that case we need the helper, otherwise we can continue
            if (
              propBinding !== undefined &&
              !(propBinding.descriptor && propBinding.descriptor.value instanceof AbstractValue)
            ) {
              defaultPropsEvaluated++;
              // if the value we have is undefined, we can apply the defaultProp
              if (propBinding.descriptor && propBinding.descriptor.value === realm.intrinsics.undefined) {
                hardModifyReactObjectPropertyBinding(realm, props, propName, Get(realm, defaultProps, propName));
              }
            }
          }
        }
      }
      // if defaultPropsEvaluated === the amount of properties defaultProps has, then we've successfully
      // ensured all the defaultProps have already been dealt with, so we don't need the helper
      if (
        !(defaultProps instanceof ObjectValue) ||
        (defaultProps.isPartialObject() || defaultPropsEvaluated !== defaultProps.properties.size)
      ) {
        props.makePartial();
        props.makeSimple();
        // if the props has any properties that are "undefined", we need to make them abstract
        // as the helper function applies defaultProps on values that are undefined or do not
        // exist
        for (let [propName, binding] of props.properties) {
          if (binding.descriptor !== undefined && binding.descriptor.value === realm.intrinsics.undefined) {
            hardModifyReactObjectPropertyBinding(realm, props, propName, AbstractValue.createFromType(realm, Value));
          }
        }
        // if we have children and they are abstract, they might be undefined at runtime
        if (children !== undefined && children instanceof AbstractValue) {
          // children === undefined ? defaultProps.children : children;
          let condition = AbstractValue.createFromBinaryOp(realm, "===", children, realm.intrinsics.undefined);
          invariant(defaultProps instanceof AbstractObjectValue || defaultProps instanceof ObjectValue);
          let conditionalChildren = AbstractValue.createFromConditionalOp(
            realm,
            condition,
            Get(realm, defaultProps, "children"),
            children
          );
          hardModifyReactObjectPropertyBinding(realm, props, "children", conditionalChildren);
        }
        let defaultPropsHelper = realm.react.defaultPropsHelper;
        invariant(defaultPropsHelper !== undefined);
        let snapshot = props.getSnapshot();
        props.temporalAlias = snapshot;
        let temporalArgs = [defaultPropsHelper, snapshot, defaultProps];
        let temporalTo = AbstractValue.createTemporalFromBuildFunction(
          realm,
          ObjectValue,
          temporalArgs,
          ([methodNode, ..._args]) => {
            return t.callExpression(methodNode, ((_args: any): Array<any>));
          },
          { skipInvariant: true }
        );
        invariant(temporalTo instanceof AbstractObjectValue);
        if (props instanceof AbstractObjectValue) {
          temporalTo.values = props.values;
        } else {
          invariant(props instanceof ObjectValue);
          temporalTo.values = new ValuesDomain(props);
        }
        props.temporalAlias = temporalTo;
        // Store the args for the temporal so we can easily clone
        // and reconstruct the temporal at another point, rather than
        // mutate the existing temporal
        realm.temporalAliasArgs.set(temporalTo, temporalArgs);
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
  invariant(props instanceof ObjectValue);
  // We know the props has no keys because if it did it would have thrown above
  // so we can remove them the props we create.
  flagPropsWithNoPartialKeyOrRef(realm, props);
  props.makeFinal();
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
  consequentVal: ObjectValue | AbstractObjectValue,
  alternateVal: ObjectValue | AbstractObjectValue,
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

export function cloneElement(
  realm: Realm,
  reactElement: ObjectValue,
  config: ObjectValue | AbstractObjectValue | NullValue,
  children: void | Value
): ObjectValue {
  let props = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

  const setProp = (name: string, value: Value): void => {
    if (name !== "__self" && name !== "__source" && name !== "key" && name !== "ref") {
      invariant(props instanceof ObjectValue || props instanceof AbstractObjectValue);
      hardModifyReactObjectPropertyBinding(realm, props, name, value);
    }
  };

  applyObjectAssignConfigsForReactElement(realm, props, [config]);
  props.makeFinal();

  let key = getProperty(realm, reactElement, "key");
  let ref = getProperty(realm, reactElement, "ref");
  let type = getProperty(realm, reactElement, "type");

  if (config !== realm.intrinsics.null) {
    let possibleKey = Get(realm, config, "key");
    if (possibleKey !== realm.intrinsics.null && possibleKey !== realm.intrinsics.undefined) {
      // if the config has been marked as having no partial key or ref and the possible key
      // is abstract, yet the config doesn't have a key property, then the key can remain null
      let keyNotNeeded =
        hasNoPartialKeyOrRef(realm, config) &&
        possibleKey instanceof AbstractValue &&
        config instanceof ObjectValue &&
        !config.properties.has("key");

      if (!keyNotNeeded) {
        key = computeBinary(realm, "+", realm.intrinsics.emptyString, possibleKey);
      }
    }

    let possibleRef = Get(realm, config, "ref");
    if (possibleRef !== realm.intrinsics.null && possibleRef !== realm.intrinsics.undefined) {
      // if the config has been marked as having no partial key or ref and the possible ref
      // is abstract, yet the config doesn't have a ref property, then the ref can remain null
      let refNotNeeded =
        hasNoPartialKeyOrRef(realm, config) &&
        possibleRef instanceof AbstractValue &&
        config instanceof ObjectValue &&
        !config.properties.has("ref");

      if (!refNotNeeded) {
        ref = possibleRef;
      }
    }
    let defaultProps =
      type instanceof ObjectValue || type instanceof AbstractObjectValue
        ? Get(realm, type, "defaultProps")
        : realm.intrinsics.undefined;

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

  if (children !== undefined) {
    hardModifyReactObjectPropertyBinding(realm, props, "children", children);
  } else {
    let elementProps = getProperty(realm, reactElement, "props");
    invariant(elementProps instanceof ObjectValue);
    let elementChildren = getProperty(realm, elementProps, "children");
    hardModifyReactObjectPropertyBinding(realm, props, "children", elementChildren);
  }

  return createInternalReactElement(realm, type, key, ref, props);
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
    invariant(consequentVal instanceof ObjectValue || consequentVal instanceof AbstractObjectValue);
    invariant(alternateVal instanceof ObjectValue || alternateVal instanceof AbstractObjectValue);
    return splitReactElementsByConditionalConfig(realm, condValue, consequentVal, alternateVal, type, children);
  }
  let { key, props, ref } = createPropsObject(realm, type, config, children);
  realm.react.reactProps.add(props);
  return createInternalReactElement(realm, type, key, ref, props);
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

  const handleChildren = () => {
    // handle children
    invariant(propsValue instanceof ObjectValue);
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
              traversalVisitor.visitChildNode(child);
            }
          }
        } else {
          traversalVisitor.visitChildNode(childrenValue);
        }
      }
    }
  };

  let propsValue = getProperty(realm, reactElement, "props");
  if (propsValue instanceof AbstractValue) {
    // visit object, as it's going to be spread
    traversalVisitor.visitAbstractOrPartialProps(propsValue);
  } else if (propsValue instanceof ObjectValue) {
    if (propsValue.isPartialObject()) {
      traversalVisitor.visitAbstractOrPartialProps(propsValue);
      handleChildren();
    } else {
      traversalVisitor.visitConcreteProps(propsValue);
      handleChildren();
    }
  }
}
