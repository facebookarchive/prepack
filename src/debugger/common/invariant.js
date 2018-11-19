/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict */

export default function invariant(condition: boolean, format: string): void {
  if (condition) return;

  let error = new Error(format);
  error.name = "Invariant Violation";
  throw error;
}
