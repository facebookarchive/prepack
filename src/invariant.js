/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict */

import { InvariantError } from "./errors.js";

export default function invariant(condition: boolean, format: string = ""): void {
  if (condition) return;
  const message = `${format}
This is likely a bug in Prepack, not your code. Feel free to open an issue on GitHub.`;
  let error = new InvariantError(message);
  error.name = "Invariant Violation";
  throw error;
}
