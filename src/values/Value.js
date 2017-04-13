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
import { EmptyValue, UndefinedValue, NullValue, BooleanValue, StringValue, SymbolValue, NumberValue, ObjectValue, ConcreteValue, AbstractObjectValue, FunctionValue } from "./index.js";

import invariant from "../invariant.js";

export default class Value {
  constructor(realm: Realm, intrinsicName?: string) {
    invariant(realm, "realm required");

    this.$Realm = realm;
    this.intrinsicName = intrinsicName;
  }

  getType(): typeof Value {
    return this.constructor;
  }

  static getTypeFromName(typeName: string): void | typeof Value {
    switch (typeName) {
      case "empty": return EmptyValue;
      case "undefined": return UndefinedValue;
      case "null": return NullValue;
      case "boolean": return BooleanValue;
      case "string": return StringValue;
      case "symbol": return SymbolValue;
      case "number": return NumberValue;
      case "object": return ObjectValue;
      case "function": return FunctionValue;
      default: return undefined;
    }
  }

  static isTypeCompatibleWith(type: typeof Value, Constructor: typeof Value): boolean {
    return type.prototype instanceof Constructor || type.prototype === Constructor.prototype;
  }

  intrinsicName: ?string;

  $Realm: Realm;

  isIntrinsic(): boolean {
    return !!this.intrinsicName;
  }

  mightBeNumber(): boolean {
    throw new Error("abstract method; please override");
  }

  mightNotBeNumber(): boolean {
    throw new Error("abstract method; please override");
  }

  mightNotBeObject(): boolean {
    throw new Error("abstract method; please override");
  }

  mightBeObject(): boolean {
    throw new Error("abstract method; please override");
  }

  mightBeUndefined(): boolean {
    throw new Error("abstract method; please override");
  }

  mightHaveBeenDeleted(): boolean {
    throw new Error("abstract method; please override");
  }

  promoteEmptyToUndefined(): Value {
    throw new Error("abstract method; please override");
  }

  throwIfNotConcrete(): ConcreteValue {
    throw new Error("abstract method; please override");
  }

  throwIfNotConcreteNumber(): NumberValue {
    throw new Error("abstract method; please override");
  }

  throwIfNotConcreteObject(): ObjectValue {
    throw new Error("abstract method; please override");
  }

  throwIfNotObject(): ObjectValue | AbstractObjectValue {
    throw new Error("abstract method; please override");
  }

  serialize(stack: Map<Value, any> = new Map()): any {
    if (stack.has(this)) {
      return stack.get(this);
    } else if (this._serialize) {
      let set = (val) => {
        stack.set(this, val);
        return val;
      };

      return set(this._serialize(set, stack));
    } else {
      throw new Error("can't serialize this type");
    }
  }

  _serialize(set: Function, stack: Map<Value, any>): any {
    throw new Error("abstract method; please override");
  }

}
