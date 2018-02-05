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
import type { BabelNodeSourceLocation } from "babel-types";
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
import * as t from "babel-types";
import invariant from "../invariant.js";
import type { FunctionBodyAstNode } from "../types.js";
import { CompilerDiagnostic } from "../errors.js";
import { EnumerableOwnProperties, Get } from "../methods/index.js";
import { Create } from "../singletons.js";

function reportCompileError(realm: Realm, message: string, loc: ?BabelNodeSourceLocation) {
  let error = new CompilerDiagnostic(message, loc, "PP9000", "RecoverableError");
  realm.handleError(error);
}

function createEmptyFunction(realm: Realm) {
  const concreteFunction = new ECMAScriptSourceFunctionValue(realm);
  concreteFunction.$ECMAScriptCode = t.blockStatement([]);
  concreteFunction.$FormalParameters = [];
  ((concreteFunction.$ECMAScriptCode: any): FunctionBodyAstNode).uniqueOrderedTag = realm.functionBodyUniqueTagSeed++;
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
  const type = val.types.getType();
  if (val.types.isTop()) {
    return new UndefinedValue(realm);
  } else if (type.prototype instanceof PrimitiveValue) {
    if (val.values.isTop()) {
      if (type === StringValue) {
        return new StringValue(realm, "__concreteModel");
      } else if (type === NumberValue) {
        return new NumberValue(realm, 42);
      } else if (type === SymbolValue) {
        return new SymbolValue(realm, new StringValue(realm, "__concreteModel"));
      } else if (type === BooleanValue) {
        return new BooleanValue(realm, true);
      } else if (type === NullValue) {
        return new NullValue(realm);
      } else if (type === UndefinedValue) {
        return new UndefinedValue(realm);
      }
    } else {
      const values = val.values.getElements();
      invariant(values.length === 1, "Concrete model should only have one value");
      return values[0];
    }
  } else if (type === FunctionValue) {
    return createEmptyFunction(realm);
  } else if (type === ArrayValue) {
    reportCompileError(
      realm,
      "Emit concrete model for abstract array value is not supported yet.",
      val.expressionLocation
    );
  } else if (val instanceof AbstractObjectValue) {
    if (val.values.isTop()) {
      return new ObjectValue(realm);
    } else {
      let template = val.getTemplate();
      if (val.isPartialObject()) {
        val.makeNotPartial();
      }
      let concreteObj = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
      let keys = EnumerableOwnProperties(realm, template, "key");
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
    "Emit concrete model for this abstract value is not supported yet.",
    val.expressionLocation
  );
  // Return undefined to make flow happy.
  return new UndefinedValue(realm);
}
