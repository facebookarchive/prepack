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
import type { BabelNodeBlockStatement, BabelNodeSourceLocation, BabelNodeLVal } from "@babel/types";
import type { FunctionBodyAstNode } from "../types.js";
import { ECMAScriptFunctionValue } from "./index.js";
import * as t from "@babel/types";
import invariant from "../invariant.js";

/* Non built-in ECMAScript function objects with source code */
export default class ECMAScriptSourceFunctionValue extends ECMAScriptFunctionValue {
  constructor(realm: Realm, intrinsicName?: string) {
    super(realm, intrinsicName);
  }

  $Strict: boolean;
  $FormalParameters: Array<BabelNodeLVal>;
  $ECMAScriptCode: BabelNodeBlockStatement;
  $HasComputedName: ?boolean;
  $HasEmptyConstructor: ?boolean;
  loc: ?BabelNodeSourceLocation;

  initialize(params: Array<BabelNodeLVal>, body: BabelNodeBlockStatement) {
    let node = ((body: any): FunctionBodyAstNode);
    this.getHash();
    // Record the sequence number, reflecting when this function was initialized for the first time
    if (node.uniqueOrderedTag === undefined) node.uniqueOrderedTag = this.$Realm.functionBodyUniqueTagSeed++;
    this.$ECMAScriptCode = body;
    this.$FormalParameters = params;
  }

  // Override.
  getName(): string {
    const uniqueTag = ((this.$ECMAScriptCode: any): FunctionBodyAstNode).uniqueOrderedTag;
    // Should only be called after the function is initialized.
    invariant(uniqueTag);
    return this.__originalName ? this.__originalName : `function#${uniqueTag}`;
  }

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
