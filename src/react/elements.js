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
import { AbstractValue, AbstractObjectValue, Value, ObjectValue, FunctionValue, NullValue } from "../values/index.js";
import { Create, Properties } from "../singletons.js";
import invariant from "../invariant.js";
import { Get } from "../methods/index.js";
import { getReactSymbol, objectHasNoPartialKeyAndRef, deleteRefAndKeyFromProps } from "./utils.js";
import * as t from "babel-types";
import { computeBinary } from "../evaluators/BinaryExpression.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";

function createPropsObject(
  realm: Realm,
  type: Value,
  config: ObjectValue | AbstractValue | AbstractObjectValue | NullValue,
  children: Value
) {
  let defaultProps = type instanceof ObjectValue ? Get(realm, type, "defaultProps") : realm.intrinsics.undefined;
  let props = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  // start by having key and ref deleted, if they actually exist, they will be add later
  deleteRefAndKeyFromProps(realm, props);
  let key = realm.intrinsics.null;
  let ref = realm.intrinsics.null;

  const setProp = (name: string, value: Value): void => {
    if (name === "key" && value !== realm.intrinsics.null) {
      key = computeBinary(realm, "+", realm.intrinsics.emptyString, value);
    } else if (name === "ref") {
      ref = value;
    } else if (name !== "__self" && name !== "__source") {
      invariant(props instanceof ObjectValue);
      Properties.Set(realm, props, name, value, true);
    }
  };

  if (
    (config instanceof AbstractObjectValue && config.isPartialObject()) ||
    config instanceof AbstractValue ||
    (config instanceof ObjectValue && config.isPartialObject() && config.isSimpleObject())
  ) {
    // if we have defaultProps, we need to create a new merge of the objects along with our config
    if (defaultProps !== realm.intrinsics.undefined || children !== realm.intrinsics.undefined) {
      if (objectHasNoPartialKeyAndRef(realm, config)) {
        let args = [];
        if (defaultProps !== realm.intrinsics.undefined) {
          args.push(defaultProps);
        }
        args.push(config);
        // create a new props object that will be the target of the Object.assign
        props = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
        // as this is "props" that is abstract, we need to make it partial and simple
        props.makePartial();
        props.makeSimple();
        // props objects also don't have a key and ref, so we remove them
        deleteRefAndKeyFromProps(realm, props);

        // get the global Object.assign
        let globalObj = Get(realm, realm.$GlobalObject, "Object");
        invariant(globalObj instanceof ObjectValue);
        let objAssign = Get(realm, globalObj, "assign");
        invariant(realm.generator);

        AbstractValue.createTemporalFromBuildFunction(
          realm,
          FunctionValue,
          [objAssign, props, ...args],
          ([methodNode, ..._args]) => {
            return t.callExpression(methodNode, ((_args: any): Array<any>));
          }
        );

        if (children !== realm.intrinsics.undefined) {
          setProp("children", children);
        }
      } else {
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
    } else {
      // as the config is partial and simple, we don't know about its prototype or properties
      // we don't have to worry about non-enumerable properties as its properties will never
      // be serialized, rather this object will be serialized as a spread.
      props = config;
    }
  } else {
    if (config instanceof ObjectValue) {
      for (let [propKey, binding] of config.properties) {
        if (binding && binding.descriptor && binding.descriptor.enumerable) {
          setProp(propKey, Get(realm, config, propKey));
        }
      }
    }

    if (children !== realm.intrinsics.undefined) {
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
    }
  }

  return { key, props, ref };
}

export function createReactElement(
  realm: Realm,
  type: Value,
  config: ObjectValue | AbstractValue | AbstractObjectValue | NullValue,
  children: Value
) {
  let { key, props, ref } = createPropsObject(realm, type, config, children);

  let obj = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  Create.CreateDataPropertyOrThrow(realm, obj, "$$typeof", getReactSymbol("react.element", realm));
  Create.CreateDataPropertyOrThrow(realm, obj, "type", type);
  Create.CreateDataPropertyOrThrow(realm, obj, "key", key);
  Create.CreateDataPropertyOrThrow(realm, obj, "ref", ref);
  Create.CreateDataPropertyOrThrow(realm, obj, "props", props);
  Create.CreateDataPropertyOrThrow(realm, obj, "_owner", realm.intrinsics.null);
  return obj;
}
