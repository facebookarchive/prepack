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
import { StringValue, ObjectValue, UndefinedValue } from "../../values/index.js";
import { Create } from "../../singletons.js";
import invariant from "../../invariant.js";

export default function(realm: Realm, obj: ObjectValue): void {
  // ECMA262 23.2.5.2.1
  obj.defineNativeMethod("next", 0, context => {
    // 1. Let O be the this value.
    let O = context.throwIfNotConcrete();

    // 2. If Type(O) is not Object, throw a TypeError exception.
    if (!(O instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not an object");
    }

    // 3. If O does not have all of the internal slots of a Set Iterator Instance (23.2.5.3), throw a TypeError exception.
    if (!("$IteratedSet" in O) || !("$SetNextIndex" in O) || !("$SetIterationKind" in O)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "SetIteratorPrototype.next isn't generic");
    }

    // 4. Let s be O.[[IteratedSet]].
    let s = O.$IteratedSet;

    // 5. Let index be O.[[SetNextIndex]].
    let index = O.$SetNextIndex;
    invariant(typeof index === "number");

    // 6. Let itemKind be O.[[SetIterationKind]].
    let itemKind = O.$SetIterationKind;

    // 7. If s is undefined, return CreateIterResultObject(undefined, true).
    if (!s || s instanceof UndefinedValue)
      return Create.CreateIterResultObject(realm, realm.intrinsics.undefined, true);
    invariant(s instanceof ObjectValue);

    // 8. Assert: s has a [[SetData]] internal slot.
    invariant(s.$SetData, "s has a [[SetData]] internal slot");

    // 9. Let entries be the List that is s.[[SetData]].
    let entries = s.$SetData;
    invariant(entries);

    // 10. Repeat while index is less than the total number of elements of entries. The number of elements must be redetermined each time this method is evaluated.
    while (index < entries.length) {
      // a. Let e be entries[index].
      let e = entries[index];

      // b. Set index to index+1.
      index = index + 1;

      // c. Set O.[[SetNextIndex]] to index.
      O.$SetNextIndex = index;

      // d. If e is not empty, then
      if (e) {
        // i. If itemKind is "key+value", then
        if (itemKind === "key+value") {
          // 1. Return CreateIterResultObject(CreateArrayFromList(« e, e »), false).
          return Create.CreateIterResultObject(realm, Create.CreateArrayFromList(realm, [e, e]), false);
        }
        // ii. Return CreateIterResultObject(e, false).
        return Create.CreateIterResultObject(realm, e, false);
      }
    }

    // 11. Set O.[[IteratedSet]] to undefined.
    O.$IteratedSet = realm.intrinsics.undefined;

    // 12. Return CreateIterResultObject(undefined, true).
    return Create.CreateIterResultObject(realm, realm.intrinsics.undefined, true);
  });

  // ECMA262 23.2.5.2.2
  obj.defineNativeProperty(realm.intrinsics.SymbolToStringTag, new StringValue(realm, "Set Iterator"), {
    writable: false,
  });
}
