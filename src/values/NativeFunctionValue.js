/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Value } from "./index.js";
import type { Realm } from "../realm.js";
import { AbstractValue, SymbolValue } from "./index.js";
import {
  NumberValue,
  StringValue,
  FunctionValue,
  ObjectValue,
  NullValue,
  ProxyValue,
  UndefinedValue,
  AbstractObjectValue,
} from "./index.js";
import { ReturnCompletion } from "../completions.js";
import { $Call, $Construct } from "../methods/function.js";
import invariant from "../invariant.js";
export type NativeFunctionCallback = (
  context: UndefinedValue | NullValue | ObjectValue | AbstractObjectValue,
  args: Array<Value>,
  argLength: number,
  newTarget?: void | ObjectValue
) => Value;

export default class NativeFunctionValue extends FunctionValue {
  constructor(
    realm: Realm,
    intrinsicName: void | string,
    name: void | string | SymbolValue | AbstractValue,
    length: number,
    callback: NativeFunctionCallback,
    constructor?: boolean = true
  ) {
    super(realm, intrinsicName);

    this.$Call = (thisArgument, argsList) => {
      return $Call(this.$Realm, this, thisArgument, argsList);
    };

    if (constructor) {
      this.$ConstructorKind = "base";
      this.$Construct = (argumentsList, newTarget) => {
        return $Construct(this.$Realm, this, argumentsList, newTarget);
      };
    } else {
      this.$ConstructorKind = undefined;
      this.$Construct = undefined;
    }

    this.$Environment = realm.$GlobalEnv;
    this.$Strict = true;

    this.callback = callback;
    this.length = length;

    this.$DefineOwnProperty("length", {
      value: new NumberValue(realm, length),
      writable: false,
      configurable: true,
      enumerable: false,
    });

    if (name) {
      if (name instanceof SymbolValue && name.$Description instanceof AbstractValue) {
        this.name = name.$Description;
      } else {
        if (name instanceof SymbolValue) {
          invariant(typeof name.$Description === "string");
          this.name = `[${name.$Description || "native"}]`;
        } else {
          this.name = name;
        }
        invariant(typeof this.name === "string");
        this.name = new StringValue(realm, this.name);
      }
      this.$DefineOwnProperty("name", {
        value: this.name,
        writable: false,
        configurable: true,
        enumerable: false,
      });
    } else {
      this.name = "native";
    }
  }

  name: string | AbstractValue;
  callback: NativeFunctionCallback;
  length: number;

  callCallback(
    context: UndefinedValue | NullValue | ObjectValue | AbstractObjectValue,
    argsList: Array<Value>,
    newTarget?: void | ObjectValue
  ): ReturnCompletion {
    let originalLength = argsList.length;
    for (let i = 0; i < this.length; i++) {
      argsList[i] = argsList[i] || this.$Realm.intrinsics.undefined;
    }
    return new ReturnCompletion(this.callback(context, argsList, originalLength, newTarget));
  }

  // for Proxy
  $RevocableProxy: void | NullValue | ProxyValue;
}
