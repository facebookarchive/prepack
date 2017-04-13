/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm } from "./realm.js";
import { initialize as initializeIntrinsics } from "./intrinsics/index.js";
import initializeGlobal from "./global.js";
import type { RealmOptions } from "./types.js";
import * as evaluators from "./evaluators/index.js";
import { NewGlobalEnvironment } from "./methods/index.js";
import { Generator } from "./utils/generator.js";


export default function(opts: RealmOptions = {}): Realm {
  let r = new Realm(opts);
  let i = r.intrinsics;
  initializeIntrinsics(i, r);
  r.$GlobalObject = initializeGlobal(r);
  for (let name in evaluators) r.evaluators[name] = evaluators[name];
  r.$GlobalEnv =  NewGlobalEnvironment(r, r.$GlobalObject, r.$GlobalObject);
  r.generator = new Generator(r);
  return r;
}
