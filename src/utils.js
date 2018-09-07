/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "./realm.js";
import {
  AbstractValue,
  ArrayValue,
  BooleanValue,
  ECMAScriptSourceFunctionValue,
  EmptyValue,
  FunctionValue,
  NullValue,
  NumberValue,
  IntegralValue,
  ObjectValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  PrimitiveValue,
  Value,
} from "./values/index.js";
import invariant from "./invariant.js";
import { ShapeInformation } from "./utils/ShapeInformation.js";
import type { ArgModel } from "./types.js";
import { CompilerDiagnostic, FatalError } from "./errors.js";
import * as t from "@babel/types";

export function typeToString(type: typeof Value): void | string {
  function isInstance(proto, Constructor): boolean {
    return proto instanceof Constructor || proto === Constructor.prototype;
  }
  let proto = type.prototype;
  if (isInstance(proto, UndefinedValue)) {
    return "undefined";
  } else if (isInstance(proto, NullValue)) {
    return "object";
  } else if (isInstance(proto, StringValue)) {
    return "string";
  } else if (isInstance(proto, BooleanValue)) {
    return "boolean";
  } else if (isInstance(proto, NumberValue)) {
    return "number";
  } else if (isInstance(proto, SymbolValue)) {
    return "symbol";
  } else if (isInstance(proto, ObjectValue)) {
    if (Value.isTypeCompatibleWith(type, FunctionValue)) {
      return "function";
    }
    return "object";
  } else {
    return undefined;
  }
}

export function getTypeFromName(typeName: string): void | typeof Value {
  switch (typeName) {
    case "empty":
      return EmptyValue;
    case "void":
      return UndefinedValue;
    case "null":
      return NullValue;
    case "boolean":
      return BooleanValue;
    case "string":
      return StringValue;
    case "symbol":
      return SymbolValue;
    case "number":
      return NumberValue;
    case "object":
      return ObjectValue;
    case "array":
      return ArrayValue;
    case "function":
      return FunctionValue;
    case "integral":
      return IntegralValue;
    default:
      return undefined;
  }
}

export function describeValue(value: Value): string {
  let title;
  let suffix = "";
  if (value instanceof PrimitiveValue) title = value.toDisplayString();
  else if (value instanceof ObjectValue) title = "[object]";
  else {
    invariant(value instanceof AbstractValue, value.constructor.name);
    title = "[abstract]";
    if (value.kind !== undefined) title += `, kind: ${value.kind}`;
    for (let arg of value.args) {
      let desc = describeValue(arg);
      suffix +=
        desc
          .split("\n")
          .map(u => "  " + u)
          .join("\n") + "\n";
    }
  }
  title += `, hash: ${value.getHash()}`;
  if (value.intrinsicName !== undefined) title += `, intrinsic name: ${value.intrinsicName}`;
  if (value.__originalName !== undefined) title += `, original name: ${value.__originalName}`;
  return suffix ? `${title}\n${suffix}` : title;
}

type DisplayResult = {} | string;

export function jsonToDisplayString<T: { toDisplayJson(number): DisplayResult }>(instance: T, depth: number): string {
  let result = instance.toDisplayJson(depth);
  return typeof result === "string" ? result : JSON.stringify(result, null, 2).replace(/\"/g, "");
}

export function verboseToDisplayJson(obj: {}, depth: number): DisplayResult {
  let result = {};
  function valueOfProp(prop) {
    if (typeof prop === "function") return undefined;
    if (Array.isArray(prop)) {
      // Try to return a 1-line string if possible
      if (prop.length === 0) return "[]";
      let valuesArray = prop.map(x => valueOfProp(x));
      if (valuesArray.length < 5) {
        let string =
          "[" + valuesArray.reduce((acc, x) => `${acc}, ${x instanceof Object ? JSON.stringify(x) : x}`) + "]";
        string = string.replace(/\"/g, "");
        if (string.length < 60) return string;
      }
      return valuesArray;
    }
    if (prop instanceof Set || prop instanceof Map) return `${prop.constructor.name}(${prop.size})`;
    if (prop.toDisplayJson) return prop.toDisplayJson(depth - 1);
    if (prop.toDisplayString) return prop.toDisplayString();
    if (prop.toJSON) return prop.toJSON();
    return prop.toString();
  }
  for (let key in obj) {
    let prop = obj[key];
    if (!prop) continue;
    let value = valueOfProp(prop);
    if (value !== undefined && value !== "[object Object]") result[key] = value;
  }
  return result;
}

export function createModelledFunctionCall(
  realm: Realm,
  funcValue: FunctionValue,
  argModelInput: void | string | ArgModel,
  thisValue: void | Value
): void => Value {
  let call = funcValue.$Call;
  invariant(call);
  let numArgs = funcValue.getLength();
  let args = [];
  let argModel = typeof argModelInput === "string" ? (JSON.parse(argModelInput): ArgModel) : argModelInput;
  invariant(funcValue instanceof ECMAScriptSourceFunctionValue);
  let params = funcValue.$FormalParameters;
  if (numArgs !== undefined && numArgs > 0 && params) {
    for (let parameterId of params) {
      if (t.isIdentifier(parameterId)) {
        // $FlowFixMe: Flow strict file does not allow for casting
        let paramName = ((parameterId: any): BabelNodeIdentifier).name;
        let shape = ShapeInformation.createForArgument(argModel, paramName);
        // Create an AbstractValue similar to __abstract being called
        args.push(
          AbstractValue.createAbstractArgument(
            realm,
            paramName,
            funcValue.expressionLocation,
            shape !== undefined ? shape.getAbstractType() : Value,
            shape
          )
        );
      } else {
        realm.handleError(
          new CompilerDiagnostic(
            "Non-identifier args to additional functions unsupported",
            funcValue.expressionLocation,
            "PP1005",
            "FatalError"
          )
        );
        throw new FatalError("Non-identifier args to additional functions unsupported");
      }
    }
  }
  let thisArg =
    thisValue !== undefined
      ? thisValue
      : AbstractValue.createAbstractArgument(realm, "this", funcValue.expressionLocation, ObjectValue);
  return () => {
    let savedPathConditions = realm.pathConditions;
    realm.pathConditions = funcValue.pathConditionDuringDeclaration;
    invariant(realm.pathConditions);
    let result = call(thisArg, args);
    realm.pathConditions = savedPathConditions;
    return result;
  };
}
