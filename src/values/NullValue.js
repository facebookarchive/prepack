/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { PrimitiveValue, Value } from "./index.js";

export default class NullValue extends PrimitiveValue {
  _serialize(): null {
    return null;
  }

  equals(x: Value): boolean {
    return x instanceof NullValue;
  }

  getHash(): number {
    return 5613143836447527;
  }

  mightBeFalse(): boolean {
    return true;
  }

  toDisplayString(): string {
    return "null";
  }
}
