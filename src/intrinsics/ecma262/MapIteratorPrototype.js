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
import { StringValue, NumberValue, ObjectValue, UndefinedValue } from "../../values/index.js";
import { Create } from "../../singletons.js";
import invariant from "../../invariant.js";

export default function(realm: Realm, obj: ObjectValue): void {
  // ECMA262 23.1.5.2.1
  obj.defineNativeMethod("next", 0, context => {
    // 1. Let O be the this value.
    let O = context.throwIfNotConcrete();

    // 2. If Type(O) is not Object, throw a TypeError exception.
    if (!(O instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not an object");
    }

    // 3. If O does not have all of the internal slots of a Set Iterator Instance (23.2.5.3), throw a TypeError exception.
    if (O.$Map === undefined || O.$MapNextIndex === undefined || O.$MapIterationKind === undefined) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "MapIteratorPrototype.next isn't generic");
    }

    // 4. Let m be O.[[Map]].
    let m = O.$Map;

    // 5. Let index be O.[[MapNextIndex]].
    let index = O.$MapNextIndex.value;

    // 6. Let itemKind be O.[[MapIterationKind]].
    let itemKind = O.$MapIterationKind;

    // 7. If m is undefined, return CreateIterResultObject(undefined, true).
    if (!m || m instanceof UndefinedValue)
      return Create.CreateIterResultObject(realm, realm.intrinsics.undefined, true);
    invariant(m instanceof ObjectValue);

    // 8. Assert: m has a [[MapData]] internal slot.
    invariant(m.$MapData, "m has a [[MapData]] internal slot");

    // 9. Let entries be the List that is m.[[MapData]].
    let entries = m.$MapData;
    invariant(entries);

    // 10. Repeat while index is less than the total number of elements of entries. The number of elements must be redetermined each time this method is evaluated.
    while (index < entries.length) {
      // a. Let e be the Record {[[Key]], [[Value]]} that is the value of entries[index].
      let e = entries[index];

      // b. Set index to index+1.
      index = index + 1;

      // c. Set O.[[MapNextIndex]] to index.
      O.$MapNextIndex = new NumberValue(realm, index);

      // d. If e.[[Key]] is not empty, then
      if (e.$Key !== undefined) {
        invariant(e.$Value !== undefined);

        let result;
        // i. If itemKind is "key", let result be e.[[Key]].
        if (itemKind === "key") result = e.$Key;
        else if (itemKind === "value")
          // ii. Else if itemKind is "value", let result be e.[[Value]].
          result = e.$Value;
        else {
          // iii. Else,
          // 1. Assert: itemKind is "key+value".
          invariant(itemKind === "key+value");

          // 2. Let result be CreateArrayFromList(« e.[[Key]], e.[[Value]] »).
          result = Create.CreateArrayFromList(realm, [e.$Key, e.$Value]);
        }

        // iv. Return CreateIterResultObject(result, false).
        return Create.CreateIterResultObject(realm, result, false);
      }
    }

    // 11. Set O.[[Map]] to undefined.
    O.$Map = realm.intrinsics.undefined;

    // 12. Return CreateIterResultObject(undefined, true).
    return Create.CreateIterResultObject(realm, realm.intrinsics.undefined, true);
  });

  // ECMA262 23.1.5.2.2
  obj.defineNativeProperty(realm.intrinsics.SymbolToStringTag, new StringValue(realm, "Map Iterator"), {
    writable: false,
  });
}
