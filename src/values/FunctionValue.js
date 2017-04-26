/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { LexicalEnvironment } from "../environment.js";
import type { Realm } from "../realm.js";
import { ObjectValue, NumberValue } from "./index.js";
import * as t from "babel-types";
import type { BabelNodeLVal, BabelNodeBlockStatement, BabelNodeSourceLocation } from "babel-types";
import invariant from "../invariant.js";

export default class FunctionValue extends ObjectValue {
  constructor(realm: Realm, intrinsicName?: string) {
    super(realm, realm.intrinsics.FunctionPrototype, intrinsicName);
  }

  $ConstructorKind: void | string;
  $ThisMode: void | string;
  $HomeObject: void | ObjectValue;
  $Environment: LexicalEnvironment;
  $Strict: boolean;
  $FormalParameters: void | Array<BabelNodeLVal>;
  $ECMAScriptCode: void | BabelNodeBlockStatement;
  $FunctionKind: string;
  $ScriptOrModule: any;
  loc: ?BabelNodeSourceLocation;

  // Indicates whether this function has been referenced by a __residual call.
  // If true, the serializer will check that the function does not access any
  // identifiers defined outside of the local scope.
  isResidual: void | true;

  getLength(): void | number {
    let binding = this.properties.get("length");
    invariant(binding);
    let desc = binding.descriptor;
    invariant(desc);
    let value = desc.value;
    if (!(value instanceof NumberValue)) return undefined;
    return value.value;
  }

  hasDefaultLength(): boolean {
    let params = this.$FormalParameters;
    if (params === undefined) return false;
    let expected = params.length;
    for (let i = 0; i < params.length; i++) {
      let param = params[i];
      if (t.isAssignmentPattern(param) || t.isRestElement(param)) {
        expected = i;
        break;
      }
    }
    return expected === this.getLength();
  }
}
