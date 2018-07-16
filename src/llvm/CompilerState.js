/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Module, Value as LLVMValue } from "llvm-node";
import type { Logger } from "../utils/logger.js";
import type { Value } from "../values/index.js";
import type { Realm } from "../realm.js";

export class CompilerState {
  +realm: Realm;
  +module: Module;
  +logger: Logger;
  +declaredVariables: Map<string, LLVMValue>;
  +builtValues: Map<Value, LLVMValue>;
  constructor(realm: Realm, module: Module, logger: Logger) {
    this.realm = realm;
    this.module = module;
    this.logger = logger;
    this.declaredVariables = new Map();
    this.builtValues = new Map();
  }
}
