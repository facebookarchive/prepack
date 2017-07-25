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
import { FunctionValue } from "./index.js";

/* Abstract base class for ordinary, non-exotic function objects */
export default class OrdinaryFunctionValue extends FunctionValue {
  constructor(realm: Realm, intrinsicName?: string) {
    super(realm, intrinsicName);
  }

  $ConstructorKind: void | string;
}
