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
import { ObjectValue, StringValue, SymbolValue, AbstractValue } from "../../values/index.js";
import { SymbolDescriptiveString } from "../../methods/index.js";
import invariant from "../../invariant.js";

export default function(realm: Realm, obj: ObjectValue): void {
  const tsTemplateSrc = "('' + A)";

  // ECMA262 19.4.3.2
  obj.defineNativeMethod("toString", 0, context => {
    const target = context instanceof ObjectValue ? context.$SymbolData : context;
    if (target instanceof AbstractValue && target.getType() === SymbolValue) {
      return AbstractValue.createFromTemplate(realm, tsTemplateSrc, StringValue, [target]);
    }
    // 1. Let s be the this value.
    let s = context.throwIfNotConcrete();

    // 2. If Type(s) is Symbol, let sym be s.
    let sym;
    if (s instanceof SymbolValue) {
      sym = s;
    } else {
      // 3. Else,
      // a. If Type(s) is not Object, throw a TypeError exception.
      if (!(s instanceof ObjectValue)) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }

      // b. If s does not have a [[SymbolData]] internal slot, throw a TypeError exception.
      if (!s.$SymbolData) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }

      // c. Let sym be the value of s's [[SymbolData]] internal slot.
      sym = s.$SymbolData;
    }
    sym.throwIfNotConcreteSymbol();
    invariant(sym instanceof SymbolValue, "expected symbol data internal slot to be a symbol value");
    // 4. Return SymbolDescriptiveString(sym).
    return new StringValue(realm, SymbolDescriptiveString(realm, sym));
  });

  // ECMA262 19.4.3.3
  obj.defineNativeMethod("valueOf", 0, context => {
    // 1. Let s be the this value.
    let s = context.throwIfNotConcrete();

    // 2. If Type(s) is Symbol, return s.
    if (s instanceof SymbolValue) return s;

    // 3. If Type(s) is not Object, throw a TypeError exception.
    if (!(s instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. If s does not have a [[SymbolData]] internal slot, throw a TypeError exception.
    if (!s.$SymbolData) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 5. Return the value of s's [[SymbolData]] internal slot.
    return s.$SymbolData;
  });

  // ECMA262 19.4.3.4
  obj.defineNativeMethod(
    realm.intrinsics.SymbolToPrimitive,
    1,
    (context, [hint]) => {
      // 1. Let s be the this value.
      let s = context.throwIfNotConcrete();

      // 2. If Type(s) is Symbol, return s.
      if (s instanceof SymbolValue) return s;

      // 3. If Type(s) is not Object, throw a TypeError exception.
      if (!(s instanceof ObjectValue)) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }

      // 4. If s does not have a [[SymbolData]] internal slot, throw a TypeError exception.
      if (!s.$SymbolData) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }

      // 5. Return s.[[SymbolData]].
      return s.$SymbolData;
    },
    { writable: false }
  );

  // ECMA262 19.4.3.5
  obj.defineNativeProperty(realm.intrinsics.SymbolToStringTag, new StringValue(realm, "Symbol"), { writable: false });
}
