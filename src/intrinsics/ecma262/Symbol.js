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
import { AbstractValue, NativeFunctionValue, StringValue, SymbolValue, UndefinedValue } from "../../values/index.js";
import { To } from "../../singletons.js";
import { SameValue } from "../../methods/abstract.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 19.4.1.1
  let func = new NativeFunctionValue(realm, "Symbol", "Symbol", 0, (context, [description], argCount, NewTarget) => {
    // 1. If NewTarget is not undefined, throw a TypeError exception.
    if (NewTarget) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. If description is undefined, let descString be undefined.
    let descString;
    if (!description || description instanceof UndefinedValue) {
      descString = undefined;
    } else if (description instanceof AbstractValue) {
      descString = description;
    } else {
      // 3. Else, let descString be ? ToString(description).
      descString = To.ToStringPartial(realm, description);
      descString = new StringValue(realm, descString);
    }
    // 4. Return a new unique Symbol value whose [[Description]] value is descString.
    return new SymbolValue(realm, descString);
  });

  // ECMA262 19.4.2.1
  func.defineNativeMethod("for", 1, (context, [key]) => {
    // 1. Let stringKey be ? ToString(key).
    let stringKey = To.ToStringPartial(realm, key);
    stringKey = new StringValue(realm, stringKey);

    // 2. For each element e of the GlobalSymbolRegistry List,
    for (let e of realm.globalSymbolRegistry) {
      // a. If SameValue(e.[[Key]], stringKey) is true, return e.[[Symbol]].
      if (e.$Key === stringKey.value) {
        return e.$Symbol;
      }
    }

    // 3. Assert: GlobalSymbolRegistry does not currently contain an entry for stringKey.

    // 4. Let newSymbol be a new unique Symbol value whose [[Description]] value is stringKey.
    let newSymbol = new SymbolValue(realm, stringKey);

    // 5. Append the Record { [[Key]]: stringKey, [[Symbol]]: newSymbol } to the GlobalSymbolRegistry List.
    realm.globalSymbolRegistry.push({ $Key: stringKey.value, $Symbol: newSymbol });

    // 6. Return newSymbol.
    return newSymbol;
  });

  // ECMA262 19.4.2.2
  func.defineNativeMethod("keyFor", 1, (context, [sym]) => {
    // 1. If Type(sym) is not Symbol, throw a TypeError exception.
    if (!(sym instanceof SymbolValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(sym) is not Symbol");
    }

    // 2. For each element e of the GlobalSymbolRegistry List (see 19.4.2.1),
    for (let e of realm.globalSymbolRegistry) {
      // a. If SameValue(e.[[Symbol]], sym) is true, return e.[[Key]].
      if (SameValue(realm, e.$Symbol, sym) === true) {
        return new StringValue(realm, e.$Key);
      }
    }

    // 3. Assert: GlobalSymbolRegistry does not currently contain an entry for sym.

    // 4. Return undefined.
    return realm.intrinsics.undefined;
  });

  // ECMA262 19.4.2.3
  func.defineNativeConstant("isConcatSpreadable", realm.intrinsics.SymbolIsConcatSpreadable);

  // ECMA262 19.4.2.10
  func.defineNativeConstant("species", realm.intrinsics.SymbolSpecies);

  // ECMA262 19.4.2.8
  func.defineNativeConstant("replace", realm.intrinsics.SymbolReplace);

  // ECMA262 19.4.2.4
  func.defineNativeConstant("iterator", realm.intrinsics.SymbolIterator);

  // ECMA262 19.4.2.2
  func.defineNativeConstant("hasInstance", realm.intrinsics.SymbolHasInstance);

  // ECMA262 19.4.2.12
  func.defineNativeConstant("toPrimitive", realm.intrinsics.SymbolToPrimitive);

  // ECMA262 19.4.2.13
  func.defineNativeConstant("toStringTag", realm.intrinsics.SymbolToStringTag);

  // ECMA262 19.4.2.14
  func.defineNativeConstant("unscopables", realm.intrinsics.SymbolUnscopables);

  // ECMA262 19.4.2.6
  func.defineNativeConstant("match", realm.intrinsics.SymbolMatch);

  // ECMA262 19.4.2.11
  func.defineNativeConstant("split", realm.intrinsics.SymbolSplit);

  // ECMA262 19.4.2.9
  func.defineNativeConstant("search", realm.intrinsics.SymbolSearch);

  return func;
}
