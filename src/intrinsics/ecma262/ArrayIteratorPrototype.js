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
import { Create, To } from "../../singletons.js";
import { NumberValue, ObjectValue, UndefinedValue, StringValue } from "../../values/index.js";
import { Get } from "../../methods/get.js";
import invariant from "../../invariant.js";

export default function(realm: Realm, obj: ObjectValue): void {
  // ECMA262 22.1.5.2.1
  obj.defineNativeMethod("next", 0, context => {
    // 1. Let O be the this value.
    let O = context.throwIfNotConcrete();

    // 2. If Type(O) is not Object, throw a TypeError exception.
    if (!(O instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not an object");
    }

    // 3. If O does not have all of the internal slots of an Array Iterator Instance (22.1.5.3), throw a TypeError exception.
    if (
      O.$IteratedObject === undefined ||
      O.$ArrayIteratorNextIndex === undefined ||
      O.$ArrayIterationKind === undefined
    ) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "ArrayIteratorPrototype.next isn't generic");
    }

    // 4. Let a be the value of the [[IteratedObject]] internal slot of O.
    let a = O.$IteratedObject;
    invariant(a instanceof ObjectValue || a instanceof UndefinedValue);

    // 5. If a is undefined, return CreateIterResultObject(undefined, true).
    if (a instanceof UndefinedValue) {
      return Create.CreateIterResultObject(realm, realm.intrinsics.undefined, true);
    }

    // 6. Let index be the value of the [[ArrayIteratorNextIndex]] internal slot of O.
    let index = O.$ArrayIteratorNextIndex.value;

    // 7. Let itemKind be the value of the [[ArrayIterationKind]] internal slot of O.
    let itemKind = O.$ArrayIterationKind;

    // 8. If a has a [[TypedArrayName]] internal slot, then
    let len;
    if (a.$TypedArrayName) {
      // a. Let len be the value of a's [[ArrayLength]] internal slot.
      len = a.$ArrayLength;
      invariant(typeof len === "number");
    } else {
      // 9. Else,
      // a. Let len be ? ToLength(? Get(a, "length")).
      len = To.ToLength(realm, Get(realm, a, "length"));
    }

    // 10. If index ≥ len, then
    if (index >= len) {
      // a. Set the value of the [[IteratedObject]] internal slot of O to undefined.
      O.$IteratedObject = realm.intrinsics.undefined;

      // b. Return CreateIterResultObject(undefined, true).
      return Create.CreateIterResultObject(realm, realm.intrinsics.undefined, true);
    }

    // 11. Set the value of the [[ArrayIteratorNextIndex]] internal slot of O to index+1.
    O.$ArrayIteratorNextIndex = new NumberValue(realm, index + 1);

    // 12. If itemKind is "key", return CreateIterResultObject(index, false).
    if (itemKind === "key") {
      return Create.CreateIterResultObject(realm, new NumberValue(realm, index), false);
    }

    // 13. Let elementKey be ! ToString(index).
    let elementKey = new StringValue(realm, index + "");

    // 14. Let elementValue be ? Get(a, elementKey).
    let elementValue = Get(realm, a, elementKey);

    // 15. If itemKind is "value", let result be elementValue.
    let result;
    if (itemKind === "value") {
      result = elementValue;
    } else {
      // 16. Else,
      // a. Assert: itemKind is "key+value".
      invariant(itemKind === "key+value", "expected item kind to be key+value");

      // b. Let result be CreateArrayFromList(« index, elementValue »).
      result = Create.CreateArrayFromList(realm, [new NumberValue(realm, index), elementValue]);
    }

    // 17. Return CreateIterResultObject(result, false).
    return Create.CreateIterResultObject(realm, result, false);
  });

  // ECMA262 22.1.5.2.2
  obj.defineNativeProperty(realm.intrinsics.SymbolToStringTag, new StringValue(realm, "Array Iterator"), {
    writable: false,
  });
}
