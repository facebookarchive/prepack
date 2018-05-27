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
import { ObjectValue, StringValue, UndefinedValue } from "../../values/index.js";
import { Get } from "../../methods/index.js";
import { To } from "../../singletons.js";

export default function(realm: Realm, obj: ObjectValue): void {
  return build("Error", realm, obj);
}

export function build(name: string, realm: Realm, obj: ObjectValue): void {
  // ECMA262 19.5.3.2
  obj.defineNativeProperty("message", realm.intrinsics.emptyString);

  // ECMA262 19.5.3.3
  obj.defineNativeProperty("name", new StringValue(realm, name));

  // ECMA262 19.5.3.4
  obj.defineNativeMethod("toString", 0, context => {
    // 1. Let O be the this value.
    let O = context.throwIfNotConcrete();

    // 2. If Type(O) is not Object, throw a TypeError exception.
    if (!(O instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. Let name be ? Get(O, "name").
    let nameValue = Get(realm, O, "name");

    // 4. If name is undefined, let name be "Error"; otherwise let name be ? ToString(name).
    let nameString = nameValue instanceof UndefinedValue ? "Error" : To.ToStringPartial(realm, nameValue);

    // 5. Let msg be ? Get(O, "message").
    let msg = Get(realm, O, "message");

    // 6. If msg is undefined, let msg be the empty String; otherwise let msg be ? ToString(msg).
    msg = msg instanceof UndefinedValue ? "" : To.ToStringPartial(realm, msg);

    // Note that in ES5, both name and msg are checked for emptiness in step 7,
    // which however is later dropped in ES6.
    // 7. If name is the empty String, return msg.
    if (nameString === "") return new StringValue(realm, msg);

    // 8. If msg is the empty String, return name.
    if (msg === "") return new StringValue(realm, nameString);

    // 9. Return the result of concatenating name, the code unit 0x003A (COLON), the code unit 0x0020 (SPACE), and msg.
    return new StringValue(realm, `${nameString}: ${msg}`);
  });
}
