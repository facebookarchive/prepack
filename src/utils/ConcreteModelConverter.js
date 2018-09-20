/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

/**
 * This file contains code that converts abstract models into concrete values.
 */

import type { Realm } from "../realm.js";
import type { BabelNodeSourceLocation } from "@babel/types";
import {
  AbstractObjectValue,
  AbstractValue,
  BooleanValue,
  ConcreteValue,
  FunctionValue,
  NullValue,
  NumberValue,
  ObjectValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  PrimitiveValue,
  ArrayValue,
  ECMAScriptSourceFunctionValue,
  Value,
} from "../values/index.js";
import * as t from "@babel/types";
import invariant from "../invariant.js";
import { CompilerDiagnostic } from "../errors.js";
import { EnumerableOwnProperties, Get } from "../methods/index.js";
import { Create } from "../singletons.js";

function reportCompileError(realm: Realm, message: string, loc: ?BabelNodeSourceLocation) {
  let error = new CompilerDiagnostic(message, loc, "PP9000", "RecoverableError");
  realm.handleError(error);
}

function createEmptyFunction(realm: Realm) {
  const concreteFunction = new ECMAScriptSourceFunctionValue(realm);
  concreteFunction.initialize([], t.blockStatement([]));
  return concreteFunction;
}

/**
 * Convert abstract model value into concrete value.
 */
export function concretize(realm: Realm, val: Value): ConcreteValue {
  if (val instanceof ConcreteValue) {
    return val;
  }
  invariant(val instanceof AbstractValue);
  if (val.kind === "abstractConcreteUnion") {
    invariant(val.args.length >= 2);
    return concretize(realm, val.args[0]);
  }
  const type = val.types.getType();
  if (val.types.isTop()) {
    return new UndefinedValue(realm);
  } else if ((type: any).prototype instanceof PrimitiveValue) {
    if (val.values.isTop()) {
      switch (type) {
        case StringValue:
          return new StringValue(realm, "__concreteModel");
        case NumberValue:
          return new NumberValue(realm, 42);
        case SymbolValue:
          return new SymbolValue(realm, new StringValue(realm, "__concreteModel"));
        case BooleanValue:
          return new BooleanValue(realm, true);
        case NullValue:
          return new NullValue(realm);
        case UndefinedValue:
          return new UndefinedValue(realm);
        default:
          invariant(false, "Not yet implemented");
      }
    } else {
      // TODO: This was broken. Is this actually used?
      const values = val.values.getElements();
      invariant(values.size === 1, "Concrete model should only have one value");
      for (let value in values) {
        invariant(value instanceof ConcreteValue, "Concrete model should only contain one concrete value");
        return value;
      }
      invariant(false);
    }
  } else if (type === FunctionValue) {
    return createEmptyFunction(realm);
  } else if (type === ArrayValue) {
    reportCompileError(
      realm,
      "Emitting a concrete model for abstract array value is not supported yet.",
      val.expressionLocation
    );
  } else if (val instanceof AbstractObjectValue) {
    if (val.values.isTop()) {
      return new ObjectValue(realm);
    } else {
      let template = val.getTemplate();
      let concreteObj = Create.ObjectCreate(realm, template.$GetPrototypeOf());
      let keys = EnumerableOwnProperties(realm, template, "key", true);
      for (let P of keys) {
        invariant(P instanceof StringValue);
        let newElement = Get(realm, template, P);
        Create.CreateDataProperty(realm, concreteObj, P, concretize(realm, newElement));
      }
      return concreteObj;
    }
  }
  reportCompileError(
    realm,
    "Emitting a concrete model for this abstract value is not supported yet.",
    val.expressionLocation
  );
  // Return undefined to make flow happy.
  return new UndefinedValue(realm);
}
