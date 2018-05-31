/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { FatalError } from "../errors.js";
import { Realm } from "../realm.js";

export function ignoreErrorsIn<T>(realm: Realm, f: () => T): void | T {
  let savedHandler = realm.errorHandler;
  realm.errorHandler = d => "Recover";
  try {
    return f();
  } catch (err) {
    if (err instanceof FatalError) return undefined;
    throw err;
  } finally {
    realm.errorHandler = savedHandler;
  }
}
