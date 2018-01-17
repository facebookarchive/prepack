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
import type { ObjectValue } from "./index.js";
import { FunctionValue, Value } from "./index.js";
import type { BabelNodeSourceLocation } from "babel-types";

/* Abstract base class for non-exotic function objects(either with source or built-in) */
export default class ECMAScriptFunctionValue extends FunctionValue {
  constructor(realm: Realm, intrinsicName?: string) {
    super(realm, intrinsicName);
  }

  $ConstructorKind: "base" | "derived";
  $ThisMode: "lexical" | "strict" | "global";
  $HomeObject: void | ObjectValue;
  $FunctionKind: "normal" | "classConstructor" | "generator";
  // If a function is called during abstract interpretation in a way that could lead to infinite recursion
  // then record the call site and actual arguments here when starting the call and use the record to
  // detect a subsequent recursive call happening at the same source location while the first call is stil active.
  // Be sure to clean this up when the function call that created it completes.
  activeArguments: void | Map<BabelNodeSourceLocation, [number, Array<Value>]>;
  isSelfRecursive: boolean;
}
