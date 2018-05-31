/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { EmptyValue, PrimitiveValue, Value } from "./index.js";

export default class UndefinedValue extends PrimitiveValue {
  _serialize() {
    return undefined;
  }

  equals(x: Value): boolean {
    return x instanceof UndefinedValue && !(x instanceof EmptyValue);
  }

  getHash(): number {
    return 792057514635681;
  }

  mightBeFalse(): boolean {
    return true;
  }

  toDisplayString(): string {
    return "undefined";
  }
}
