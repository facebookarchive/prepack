/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Value } from "./index.js";
import type { Realm } from "../realm.js";
import { SymbolValue } from "./index.js";
import {
  NumberValue,
  StringValue,
  ECMAScriptFunctionValue,
  ObjectValue,
  NullValue,
  ProxyValue,
  UndefinedValue,
  AbstractObjectValue,
} from "./index.js";
import type { PromiseCapability } from "../types.js";
import { ReturnCompletion } from "../completions.js";
import { Functions } from "../singletons.js";
import { PropertyDescriptor } from "../descriptors.js";
export type NativeFunctionCallback = (
  context: UndefinedValue | NullValue | ObjectValue | AbstractObjectValue,
  args: Array<Value>,
  argLength: number,
  newTarget?: void | ObjectValue
) => Value;

/* Built-in Function Objects */
export default class NativeFunctionValue extends ECMAScriptFunctionValue {
  constructor(
    realm: Realm,
    intrinsicName: void | string,
    name: void | string | SymbolValue,
    length: number,
    callback: NativeFunctionCallback,
    constructor?: boolean = true
  ) {
    super(realm, intrinsicName);

    this.$ThisMode = "strict";
    this.$HomeObject = undefined;
    this.$FunctionKind = "normal";

    this.$Call = (thisArgument, argsList) => {
      return Functions.$Call(this.$Realm, this, thisArgument, argsList);
    };

    if (constructor) {
      this.$ConstructorKind = "base";
      this.$Construct = (argumentsList, newTarget) => {
        return Functions.$Construct(this.$Realm, this, argumentsList, newTarget);
      };
    }

    this.$Environment = realm.$GlobalEnv;

    this.callback = callback;
    this.length = length;

    this.$DefineOwnProperty(
      "length",
      new PropertyDescriptor({
        value: new NumberValue(realm, length),
        writable: false,
        configurable: true,
        enumerable: false,
      })
    );

    if (name !== undefined && name !== "") {
      if (name instanceof SymbolValue) {
        this.name = name.$Description ? `[${name.$Description.throwIfNotConcreteString().value}]` : "[native]";
      } else {
        this.name = name;
      }
      this.$DefineOwnProperty(
        "name",
        new PropertyDescriptor({
          value: new StringValue(realm, this.name),
          writable: false,
          configurable: true,
          enumerable: false,
        })
      );
    } else {
      this.name = "native";
    }
  }

  static trackedPropertyNames = ObjectValue.trackedPropertyNames.concat("$RevocableProxy");

  getTrackedPropertyNames(): Array<string> {
    return NativeFunctionValue.trackedPropertyNames;
  }

  hasDefaultLength(): boolean {
    return this.getLength() === this.length;
  }

  name: string;
  callback: NativeFunctionCallback;
  length: number;

  // Override.
  getName(): string {
    return this.name;
  }

  callCallback(
    context: UndefinedValue | NullValue | ObjectValue | AbstractObjectValue,
    originalArgsList: Array<Value>,
    newTarget?: void | ObjectValue
  ): ReturnCompletion {
    let originalLength = originalArgsList.length;
    let argsList = originalArgsList.slice();
    for (let i = 0; i < this.length; i++) {
      argsList[i] = originalArgsList[i] || this.$Realm.intrinsics.undefined;
    }
    return new ReturnCompletion(
      this.callback(context, argsList, originalLength, newTarget),
      this.$Realm.currentLocation
    );
  }

  // for Proxy
  $RevocableProxy: void | NullValue | ProxyValue;

  // for Promise resolve/reject functions
  $Promise: ?ObjectValue;
  $AlreadyResolved: void | { value: boolean };

  // for Promise resolve functions
  $Capability: void | PromiseCapability;
  $AlreadyCalled: void | { value: boolean };
  $Index: void | number;
  $Values: void | Array<Value>;
  $Capabilities: void | PromiseCapability;
  $RemainingElements: void | { value: number };
}
