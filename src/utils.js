/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import {
  AbstractValue,
  ArrayValue,
  BooleanValue,
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
      let t = describeValue(arg);
      suffix +=
        t
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

export function isUndefinedOrNull(value: void | mixed): boolean {
  return typeof value === "undefined" || value === null;
}
