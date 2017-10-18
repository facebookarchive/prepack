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
  FunctionValue,
  UndefinedValue,
  StringValue,
  NumberValue,
  BooleanValue,
  NullValue,
  AbstractValue,
  ArrayValue,
  ObjectValue,
} from "../values/index.js";
import { ReactStatistics } from "../serializer/types.js";
import { isReactElement, getJSXPropertyValue } from "../utils/jsx.js";
import { ExecutionContext } from "../realm.js";
import { AbruptCompletion } from "../completions.js";
import { GetValue, Get, ObjectCreate } from "../methods/index.js";
import buildExpressionTemplate from "../utils/builder.js";
import { ValuesDomain } from "../domains/index.js";
import invariant from "../invariant.js";
import { flowAnnotationToObject } from "../flow/utils.js";
import * as t from "babel-types";
import type { BabelNodeIdentifier } from "babel-types";

function isReactClassComponent(type) {
  if (!(type instanceof FunctionValue)) {
    return false;
  }
  // any ES2015 class supported for now.
  return type.$FunctionKind === "classConstructor";
}

function getError(realm: Realm, completionValue: AbruptCompletion) {
  // extract an execution error from the Prepack environment.
  let context = new ExecutionContext();
  realm.pushContext(context);
  try {
    let message = (Get(realm, (completionValue: any).value, "message"): any).value;
    let stack = (Get(realm, (completionValue: any).value, "stack"): any).value;
    let error = new Error("Error evaluating function");
    error.stack = message + "\n" + stack;
    return error;
  } finally {
    realm.popContext(context);
  }
}

function createObject(realm: Realm, shape: null | { [id: string]: any }, name: string | null) {
  let obj = ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  if (shape != null) {
    // to get around Flow complaining that shape could be null
    let shapeThatIsNotNull = shape;
    Object.keys(shape).forEach((id: string) => {
      let value = shapeThatIsNotNull[id];
      obj.$Set(id, value, obj);
      if (name !== null) {
        value.intrinsicName = `${name}.${id}`;
      }
    });
  }
  if (name !== null) {
    obj.intrinsicName = name;
  }
  return obj;
}

function createAbstractByType(realm: Realm, typeNameString: string, name: string) {
  let type = Value.getTypeFromName(typeNameString);
  invariant(type !== undefined, "createAbstractByType() cannot be undefined");
  let value = AbstractValue.createFromTemplate(realm, buildExpressionTemplate(name), type, [], name);
  value.intrinsicName = name;
  return value;
}

function _createAbstractObject(realm: Realm, name: string, properties): AbstractValue {
  let value = AbstractValue.createFromTemplate(realm, buildExpressionTemplate(name), ObjectValue, [], name);
  value.intrinsicName = name;
  let template = createObject(realm, properties, name);
  template.makePartial();
  template.makeSimple();
  value.values = new ValuesDomain(new Set([template]));
  realm.rebuildNestedProperties(value, name);
  return value;
}

function createAbstractObject(realm: Realm, name: string | null, objectTypes: any): ObjectValue | AbstractValue {
  if (typeof objectTypes === "string") {
    invariant(
      objectTypes === "empty",
      `Expected an object or a string of "empty" for createAbstractObject() paramater "objectTypes"`
    );
    return _createAbstractObject(realm, name || "unknown", null);
  }
  if (objectTypes !== null) {
    let propTypeObject = {};

    Object.keys(objectTypes).forEach(key => {
      let value = objectTypes[key];
      let propertyName = name !== null ? `${name}.${key}` : key;
      if (typeof value === "string") {
        propTypeObject[key] = createAbstractByType(realm, value, propertyName);
      } else if (typeof value === "object" && value !== null) {
        propTypeObject[key] = createAbstractObject(realm, propertyName, value);
      } else {
        invariant(false, `Unknown propType value of "${value}" for "${key}"`);
      }
    });

    return _createAbstractObject(realm, name || "unknown", propTypeObject);
  } else {
    return _createAbstractObject(realm, name || "unknown", null);
  }
}

function callFunction(realm: Realm, functionValue: FunctionValue, thisArg, argsList = []) {
  if (thisArg === undefined) {
    thisArg = realm.intrinsics.undefined;
  }
  let context = new ExecutionContext();
  context.lexicalEnvironment = realm.$GlobalEnv;
  context.variableEnvironment = realm.$GlobalEnv;
  context.realm = realm;
  realm.pushContext(context);

  let res;
  try {
    invariant(typeof functionValue.$Call === "function", "Bad function value passed to callFunction()");
    res = functionValue.$Call(thisArg, argsList);
  } catch (completion) {
    if (completion instanceof AbruptCompletion) {
      res = completion;
    } else {
      throw completion;
    }
  } finally {
    realm.popContext(context);
  }
  if (res instanceof AbruptCompletion) {
    let error = getError(realm, res);
    throw error;
  }
  return GetValue(realm, res);
}

class Reconciler {
  constructor(realm: Realm, moduleTracer: ModuleTracer, statistics: ReactStatistics) {
    this.realm = realm;
    this.moduleTracer = moduleTracer;
    this.statistics = statistics;
  }

  realm: Realm;
  moduleTracer: ModuleTracer;
  statistics: ReactStatistics;

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
      propTypes = flowAnnotationToObject(componentType.$FormalParameters[0].typeAnnotation);
    }
    if (componentType.$FormalParameters.length > 1) {
      if (t.isIdentifier(componentType.$FormalParameters[1])) {
        contextName = ((componentType.$FormalParameters[1]: any): BabelNodeIdentifier).name;
      }
      invariant(
        componentType.$FormalParameters[1].typeAnnotation,
        `__registerReactComponentRoot() failed due to root component missing Flow type annotations for the "context" argument`
      );
      contextTypes = flowAnnotationToObject(componentType.$FormalParameters[1].typeAnnotation);
    }
    return this.realm.wrapInGlobalEnv(() =>
      this.realm.evaluateForEffects(() => {
        let initialProps = createAbstractObject(this.realm, propsName, propTypes);
        let initialContext = createAbstractObject(this.realm, contextName, contextTypes);
        try {
          let { result } = this._renderAsDeepAsPossible(componentType, initialProps, initialContext, false);
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
    isBranched: boolean
  ) {
    let { value, commitDidMountPhase, childContext } = this._renderOneLevel(componentType, props, context, isBranched);
    let result = this._resolveDeeply(value, childContext, isBranched);
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
    isBranched: boolean
  ) {
    if (isReactClassComponent(componentType)) {
      // for now we don't support class components, so we bail out
      throw new Error("Component bail out");
    } else {
      let value = callFunction(this.realm, componentType, undefined, [props, context]);
      return { value, commitDidMountPhase: null, childContext: context };
    }
  }
  _resolveDeeply(value: Value, context: ObjectValue | AbstractValue, isBranched: boolean) {
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
        value.args[i] = this._resolveDeeply(value.args[i], context, true);
      }
      return value;
    }
    if (value instanceof ArrayValue) {
      this._resolveFragment(value, context, isBranched);
      return value;
    }
    if (value instanceof ObjectValue && isReactElement(value)) {
      let properties = value.properties;
      let typeValue = getJSXPropertyValue(this.realm, properties, "type");
      let propsValue = getJSXPropertyValue(this.realm, properties, "props");
      let refValue = getJSXPropertyValue(this.realm, properties, "ref");
      if (typeValue instanceof StringValue) {
        // terminal host component. Start evaluating its children.
        if (propsValue instanceof ObjectValue) {
          let childrenProperty = propsValue.properties.get("children");
          if (childrenProperty) {
            let childrenPropertyDescriptor = childrenProperty.descriptor;
            invariant(childrenPropertyDescriptor, "");
            let childrenPropertyValue = childrenPropertyDescriptor.value;
            invariant(childrenPropertyValue instanceof Value, `Bad "children" prop passed in JSXElement`);
            let resolvedChildren = this._resolveDeeply(childrenPropertyValue, context, isBranched);
            childrenPropertyDescriptor.value = resolvedChildren;
          }
        }
        return value;
      }
      // we do not support "ref" on <Component /> ReactElements
      if (!(refValue instanceof NullValue)) {
        return value;
      }
      if (!(propsValue instanceof ObjectValue || propsValue instanceof AbstractValue)) {
        return value;
      }
      if (!(typeValue instanceof ECMAScriptSourceFunctionValue)) {
        return value;
      }
      try {
        let { result, commitDidMountPhase } = this._renderAsDeepAsPossible(typeValue, propsValue, context, isBranched);
        if (result === null) {
          return value;
        }
        if (result instanceof UndefinedValue) {
          return value;
        }
        this.statistics.inlinedComponents++;
        if (commitDidMountPhase !== null) {
          commitDidMountPhase();
        }
        return result;
      } catch (e) {
        // a child component bailed out during component folding, so return the function value and continue
        return value;
      }
    } else {
      return value;
    }
  }
  _resolveFragment(arrayValue: ArrayValue, context: ObjectValue | AbstractValue, isBranched: boolean) {
    let lengthProperty = arrayValue.properties.get("length");
    let value;
    if (lengthProperty !== undefined) {
      invariant(lengthProperty.descriptor, "Invalid JSXElement children length descriptor");
      value = lengthProperty.descriptor.value;
    }
    invariant(
      lengthProperty && value instanceof NumberValue,
      "Invalid children length on JSXElement during reconcilation"
    );
    let length = value.value;
    for (let i = 0; i < length; i++) {
      let elementProperty = arrayValue.properties.get("" + i);
      let elementPropertyDescriptor = elementProperty && elementProperty.descriptor;
      invariant(elementPropertyDescriptor, `Invalid JSXElement child[${i}] descriptor`);
      let elementValue = elementPropertyDescriptor.value;
      if (elementValue instanceof Value) {
        elementPropertyDescriptor.value = this._resolveDeeply(elementValue, context, isBranched);
      }
    }
  }
}

export default Reconciler;
