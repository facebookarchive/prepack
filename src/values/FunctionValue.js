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
import { ObjectValue } from "./index.js";
import * as t from "babel-types";
import type { BabelNodeLVal, BabelNodeBlockStatement, BabelNodeSourceLocation } from "babel-types";

export default class FunctionValue extends ObjectValue {
  constructor(realm: Realm, intrinsicName?: string) {
    super(realm, realm.intrinsics.FunctionPrototype, intrinsicName);
  }

  $ConstructorKind: void | string;
  $ThisMode: void | string;
  $HomeObject: void | ObjectValue;
  $Environment: LexicalEnvironment;
  $Strict: boolean;
  $FormalParameters: Array<BabelNodeLVal>;
  $ECMAScriptCode: BabelNodeBlockStatement;
  $FunctionKind: string;
  $ScriptOrModule: any;
  loc: ?BabelNodeSourceLocation;

  // Indicates whether this function has been referenced by a __residual call.
  // If true, the serializer will check that the function does not access any
  // identifiers defined outside of the local scope.
  isResidual: void | true;

  getArity(): number {
    let params = this.$FormalParameters;
    for (let i = 0; i < params.length; i++) {
      let param = params[i];
      if (t.isAssignmentPattern(param) || t.isRestElement(param)) {
        return i;
      }
    }
    return params.length;
  }
}
