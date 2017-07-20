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
import type { BabelNodeBlockStatement, BabelNodeSourceLocation, BabelNodeLVal } from "babel-types";
import { FunctionValue, ObjectValue } from "./index.js";
import * as t from "babel-types";

/* ECMAScript Function Objects */
export default class ECMAScriptFunctionValue extends FunctionValue {
  constructor(realm: Realm, intrinsicName?: string) {
    super(realm, intrinsicName);
  }

  $ThisMode: string;
  $Strict: boolean;
  $FunctionKind: string;
  $HomeObject: void | ObjectValue;
  $FormalParameters: Array<BabelNodeLVal>;
  $ECMAScriptCode: BabelNodeBlockStatement;
  loc: ?BabelNodeSourceLocation;

  hasDefaultLength(): boolean {
    let params = this.$FormalParameters;
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
