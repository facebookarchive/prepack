/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../realm.js";
import type { ObjectValue } from "./index.js";
import { FunctionValue, Value } from "./index.js";
import type { BabelNodeSourceLocation } from "@babel/types";

/* Abstract base class for non-exotic function objects(either with source or built-in) */
export default class ECMAScriptFunctionValue extends FunctionValue {
  constructor(realm: Realm, intrinsicName?: string) {
    super(realm, intrinsicName);
    this.isCalledInMultipleContexts = false;
  }

  $ConstructorKind: "base" | "derived";
  $ThisMode: "lexical" | "strict" | "global";
  $HomeObject: void | ObjectValue;
  $FunctionKind: "normal" | "classConstructor" | "generator";
  activeArguments: void | Map<BabelNodeSourceLocation, [number, Array<Value>]>;
  isSelfRecursive: boolean;
  isCalledInMultipleContexts: boolean;
}
