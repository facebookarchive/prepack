/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { FatalError } from "../../errors.js";
import type { Realm } from "../../realm.js";
import { FunctionValue } from "../../values/index.js";

declare var process: any;

export default function(realm: Realm): FunctionValue {
  // Extract the bootstrap source code from the hosting Node version.
  let nodeSourceCode = process.binding("natives");
  let bootstrapSource = nodeSourceCode["internal/bootstrap_node"];
  let bootstrapFilename = "bootstrap_node.js";
  if (!bootstrapSource) {
    throw new FatalError("The node-cli mode is only compatible with Node 7.");
  }

  // We evaluate bootstrap script to get the bootstrap function.
  let bootstrapFn = realm.$GlobalEnv.execute(bootstrapSource, bootstrapFilename, "");

  if (!(bootstrapFn instanceof FunctionValue) || !bootstrapFn.$Call) {
    throw new FatalError("The node bootstrap script should always yield a function.");
  }

  return bootstrapFn;
}
