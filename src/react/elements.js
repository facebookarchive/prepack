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
  AbstractObjectValue,
  StringValue,
  Value,
  ObjectValue,
  FunctionValue,
  NullValue,
  SymbolValue,
} from "../values/index.js";
import { Create, Properties } from "../singletons.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import invariant from "../invariant.js";
import { Get } from "../methods/index.js";
import { getReactSymbol } from "./utils.js";
import * as t from "babel-types";
import { computeBinary } from "../evaluators/BinaryExpression.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";

function createPropsObject(
  realm: Realm,
  type: ObjectValue | AbstractObjectValue | StringValue | SymbolValue,
  config: ObjectValue | AbstractObjectValue | NullValue,
  children: Value
) {
  let defaultProps = type instanceof ObjectValue ? Get(realm, type, "defaultProps") : null;
  let props = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  let key = realm.intrinsics.null;
  let ref = realm.intrinsics.null;

  const setProp = (name: string, value: Value): void => {
    if (name === "children") {
      invariant(props instanceof ObjectValue);
      Properties.Set(realm, props, "children", value, true);
    } else if (name === "key" && value !== realm.intrinsics.null) {
      key = computeBinary(realm, "+", realm.intrinsics.emptyString, value);
    } else if (name === "ref") {
      ref = value;
    } else if (name !== "__self" && name !== "__source") {
      invariant(props instanceof ObjectValue);
      Properties.Set(realm, props, name, value, true);
    }
  };

  if (config instanceof AbstractObjectValue && config.isPartialObject()) {
    // if we have defaultProps or children, we need to create a new merge of the objects
    // along with our config
    if (defaultProps !== realm.intrinsics.undefined || children !== realm.intrinsics.undefined) {
      let args = [];
      if (defaultProps !== realm.intrinsics.undefined) {
        args.push(defaultProps);
      }
      args.push(config);
      if (children !== realm.intrinsics.undefined) {
        args.push(children);
      }
      let emptyObject = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
      let types = new TypesDomain(FunctionValue);
      let values = new ValuesDomain();
      invariant(realm.generator);
      props = realm.generator.derive(types, values, [emptyObject, ...args], _args => {
        return t.callExpression(
          t.memberExpression(t.identifier("Object"), t.identifier("assign")),
          ((_args: any): Array<any>)
        );
      });
      invariant(config instanceof AbstractObjectValue);
    } else {
      props = config;
    }
    let reactHint = realm.react.abstractHints.get(config);

    if (reactHint !== "HAS_NO_KEY_OR_REF") {
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
    if (config instanceof ObjectValue) {
      for (let [propKey] of config.properties) {
        setProp(propKey, Get(realm, config, propKey));
      }
    }

    if (children !== realm.intrinsics.undefined) {
      setProp("children", children);
    }

    if (defaultProps instanceof ObjectValue) {
      for (let [propKey] of defaultProps.properties) {
        if (Get(realm, props, propKey) === realm.intrinsics.undefined) {
          setProp(propKey, Get(realm, defaultProps, propKey));
        }
      }
    }
  }

  return { key, props, ref };
}

export function createReactElement(
  realm: Realm,
  type: ObjectValue | AbstractObjectValue | StringValue | SymbolValue,
  config: ObjectValue | AbstractObjectValue | NullValue,
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
