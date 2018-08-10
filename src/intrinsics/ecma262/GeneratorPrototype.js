/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../../realm.js";
import { ReturnCompletion } from "../../completions.js";
import { ObjectValue, StringValue } from "../../values/index.js";
import { GeneratorResume, GeneratorResumeAbrupt } from "../../methods/generator.js";

export default function(realm: Realm, obj: ObjectValue): void {
  // ECMA262 25.3.1.2
  obj.defineNativeMethod("next", 1, (context, [value]) => {
    // 1. Let g be the this value.
    let g = context;

    // 2. Return ? GeneratorResume(g, value).
    return GeneratorResume(realm, g, value);
  });

  // ECMA262 25.3.1.3
  obj.defineNativeMethod("return", 1, (context, [value]) => {
    // 1. Let g be the this value.
    let g = context;

    // 2. Let C be Completion{[[Type]]: return, [[Value]]: value, [[Target]]: empty}.
    let C = new ReturnCompletion(value, realm.currentLocation);

    // 3. Return ? GeneratorResumeAbrupt(g, C).
    return GeneratorResumeAbrupt(realm, g, C);
  });

  // ECMA262 25.3.1.4
  obj.defineNativeMethod("throw", 1, (context, [exception]) => {
    // 1. Let g be the this value.
    let g = context;

    // 2. Let C be Completion{[[Type]]: throw, [[Value]]: exception, [[Target]]: empty}.
    let C = new ReturnCompletion(exception, realm.currentLocation);

    // 3. Return ? GeneratorResumeAbrupt(g, C).
    return GeneratorResumeAbrupt(realm, g, C);
  });

  // ECMA262 25.3.1.5
  obj.defineNativeProperty(realm.intrinsics.SymbolToStringTag, new StringValue(realm, "Generator"), {
    writable: false,
  });
}
