/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { PrimitiveValue } from "./index.js";
import type { Realm } from "../realm.js";

export default class SymbolValue extends PrimitiveValue {
  constructor(realm: Realm, desc?: string, intrinsicName?: string) {
    super(realm, intrinsicName);
    this.$Description = desc;
  }

  $Description: ?string;

  _serialize(): Symbol {
    return Symbol(this.$Description);
  }
}
