/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeSourceLocation } from "babel-types";
import type { Realm } from "../realm.js";
import {
  EmptyValue,
  UndefinedValue,
  NullValue,
  BooleanValue,
  StringValue,
  SymbolValue,
  NumberValue,
  ObjectValue,
  ConcreteValue,
  AbstractObjectValue,
  FunctionValue,
} from "./index.js";

import invariant from "../invariant.js";

export default class Value {
  constructor(realm: Realm, intrinsicName?: string) {
    invariant(realm, "realm required");

    this.$Realm = realm;
    this.intrinsicName = intrinsicName;
    this.expressionLocation = realm.currentLocation;
  }
  // Name from original source if existant
  __originalName: void | string;

  getType(): typeof Value {
    return this.constructor;
  }

  static getTypeFromName(typeName: string): void | typeof Value {
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
      case "function":
        return FunctionValue;
      default:
        return undefined;
    }
  }

  static isTypeCompatibleWith(type: typeof Value, Constructor: typeof Value): boolean {
    return type.prototype instanceof Constructor || type.prototype === Constructor.prototype;
  }

  intrinsicName: ?string;
  // The source location of the expression that first produced this value.
  expressionLocation: ?BabelNodeSourceLocation;
  $Realm: Realm;

  isIntrinsic(): boolean {
    return !!this.intrinsicName;
  }

  mightBeFalse(): boolean {
    invariant(false, "abstract method; please override");
  }

  mightNotBeFalse(): boolean {
    invariant(false, "abstract method; please override");
  }

  mightBeNull(): boolean {
    invariant(false, "abstract method; please override");
  }

  mightBeNumber(): boolean {
    invariant(false, "abstract method; please override");
  }

  mightNotBeNumber(): boolean {
    invariant(false, "abstract method; please override");
  }

  mightNotBeObject(): boolean {
    invariant(false, "abstract method; please override");
  }

  mightBeObject(): boolean {
    invariant(false, "abstract method; please override");
  }

  mightNotBeString(): boolean {
    invariant(false, "abstract method; please override");
  }

  mightBeTrue(): boolean {
    return this.mightNotBeFalse();
  }

  mightNotBeTrue(): boolean {
    return this.mightBeFalse();
  }

  mightBeUndefined(): boolean {
    invariant(false, "abstract method; please override");
  }

  mightHaveBeenDeleted(): boolean {
    invariant(false, "abstract method; please override");
  }

  promoteEmptyToUndefined(): Value {
    invariant(false, "abstract method; please override");
  }

  throwIfNotConcrete(): ConcreteValue {
    invariant(false, "abstract method; please override");
  }

  throwIfNotConcreteNumber(): NumberValue {
    invariant(false, "abstract method; please override");
  }

  throwIfNotConcreteString(): StringValue {
    throw new Error("abstract method; please override");
  }

  throwIfNotConcreteBoolean(): BooleanValue {
    throw new Error("abstract method; please override");
  }

  throwIfNotConcreteSymbol(): SymbolValue {
    throw new Error("abstract method; please override");
  }

  throwIfNotConcreteObject(): ObjectValue {
    invariant(false, "abstract method; please override");
  }

  throwIfNotObject(): ObjectValue | AbstractObjectValue {
    invariant(false, "abstract method; please override");
  }

  throwIfNotConcreteString(): StringValue {
    invariant(false, "abstract method; please override");
  }

  serialize(stack: Map<Value, any> = new Map()): any {
    if (stack.has(this)) {
      return stack.get(this);
    } else {
      let set = val => {
        stack.set(this, val);
        return val;
      };

      return set(this._serialize(set, stack));
    }
  }

  _serialize(set: Function, stack: Map<Value, any>): any {
    invariant(false, "abstract method; please override");
  }
}
