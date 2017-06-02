/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { IntrospectionThrowCompletion } from "../completions.js";
import { Realm } from "../realm.js";

export function recoverableError<T>(realm: Realm, action: ()=>T, recovery: ()=>T): T {
  try {
    return action();
  } catch (err) {
    // We only allow handling IntrospectionThrowCompletion errors
    if (!(err instanceof IntrospectionThrowCompletion)) throw err;

    // If the error handler indicated we shouldn't recover, then just rethrow
    if (!realm.handleError(err)) throw err;

    // Return the recovery value
    return recovery();
  }
}
