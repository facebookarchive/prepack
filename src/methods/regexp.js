/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../realm.js";
import invariant from "../invariant.js";
import { NullValue, NumberValue, ObjectValue, StringValue, UndefinedValue, Value } from "../values/index.js";
import { Get } from "./get.js";
import { IsCallable } from "./is.js";
import { Call } from "./call.js";
import { HasCompatibleType, HasSomeCompatibleType } from "./has.js";
import { Create, Properties, To } from "../singletons.js";
import { PropertyDescriptor } from "../descriptors.js";

// ECMA262 21.2.3.2.3
export function RegExpCreate(realm: Realm, P: ?Value, F: ?Value): ObjectValue {
  // 1. Let obj be ? RegExpAlloc(%RegExp%).
  let obj = RegExpAlloc(realm, realm.intrinsics.RegExp);

  // 2. Return ? RegExpInitialize(obj, P, F).
  return RegExpInitialize(realm, obj, P, F);
}

// ECMA262 21.2.3.2.1
export function RegExpAlloc(realm: Realm, newTarget: ObjectValue): ObjectValue {
  // 1. Let obj be ? OrdinaryCreateFromConstructor(newTarget, "%RegExpPrototype%", « [[RegExpMatcher]],
  //    [[OriginalSource]], [[OriginalFlags]] »).
  let obj = Create.OrdinaryCreateFromConstructor(realm, newTarget, "RegExpPrototype", {
    $RegExpMatcher: undefined, // always initialized to not undefined before use
    $OriginalSource: undefined, // ditto
    $OriginalFlags: undefined, // ditto
  });

  // 2. Perform ! DefinePropertyOrThrow(obj, "lastIndex", PropertyDescriptor {[[Writable]]: true,
  //    [[Enumerable]]: false, [[Configurable]]: false}).
  Properties.DefinePropertyOrThrow(
    realm,
    obj,
    "lastIndex",
    new PropertyDescriptor({
      writable: true,
      enumerable: false,
      configurable: false,
    })
  );

  // 3. Return obj.
  return obj;
}

// ECMA262 21.2.3.2.2
export function RegExpInitialize(realm: Realm, obj: ObjectValue, pattern: ?Value, flags: ?Value): ObjectValue {
  // Note that obj is a new object, and we can thus write to internal slots
  invariant(realm.isNewObject(obj));

  // 1. If pattern is undefined, let P be the empty String.
  let P;
  if (!pattern || HasCompatibleType(pattern, UndefinedValue)) {
    P = "";
  } else {
    // 2. Else, let P be ? ToString(pattern).
    P = To.ToStringPartial(realm, pattern);
  }

  // 3. If flags is undefined, let F be the empty String.
  let F;
  if (!flags || HasCompatibleType(flags, UndefinedValue)) {
    F = "";
  } else {
    // 4. Else, let F be ? ToString(flags).
    F = To.ToStringPartial(realm, flags);
  }

  // 5. If F contains any code unit other than "g", "i", "m", "u", or "y" or if it contains the same code unit more than once, throw a SyntaxError exception.
  for (let i = 0; i < F.length; ++i) {
    if ("gimuy".indexOf(F.charAt(i)) < 0) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.SyntaxError, "invalid RegExp flag");
    }
    for (let j = i + 1; j < F.length; ++j) {
      if (F.charAt(i) === F.charAt(j)) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.SyntaxError, "duplicate RegExp flag");
      }
    }
  }

  // 6. If F contains "u", let BMP be false; else let BMP be true.
  let BMP = F.indexOf("u") >= 0 ? false : true;

  // 7. If BMP is true, then
  if (BMP) {
    // a. Parse P using the grammars in 21.2.1 and interpreting each of its 16-bit elements as a Unicode BMP
    //    code point. UTF-16 decoding is not applied to the elements. The goal symbol for the parse is
    //    Pattern. Throw a SyntaxError exception if P did not conform to the grammar, if any elements of P
    //    were not matched by the parse, or if any Early Error conditions exist.
    // b. Let patternCharacters be a List whose elements are the code unit elements of P.
  } else {
    // 8. Else,
    // a. Parse P using the grammars in 21.2.1 and interpreting P as UTF-16 encoded Unicode code points
    //    (6.1.4). The goal symbol for the parse is Pattern[U]. Throw a SyntaxError exception if P did not
    //    conform to the grammar, if any elements of P were not matched by the parse, or if any Early Error
    //    conditions exist.
    // b. Let patternCharacters be a List whose elements are the code points resulting from applying UTF-16
    //    decoding to P's sequence of elements.
  }

  // 9. Set the value of obj's [[OriginalSource]] internal slot to P.
  obj.$OriginalSource = P;

  // 10. Set the value of obj's [[OriginalFlags]] internal slot to F.
  obj.$OriginalFlags = F;

  // 11. Set obj's [[RegExpMatcher]] internal slot to the internal procedure that evaluates the above parse of
  //     P by applying the semantics provided in 21.2.2 using patternCharacters as the pattern's List of
  //     SourceCharacter values and F as the flag parameters.
  try {
    let computedFlags = "y";
    if (F.indexOf("i") >= 0) computedFlags += "i";
    if (F.indexOf("u") >= 0) computedFlags += "u";
    if (F.indexOf("m") >= 0) computedFlags += "m";
    let matcher = new RegExp(P, (computedFlags: any));

    obj.$RegExpMatcher = (S: string, lastIndex: number) => {
      matcher.lastIndex = lastIndex;
      let match = matcher.exec(S);
      if (!match) {
        return null;
      }
      return {
        endIndex: match.index + match[0].length,
        captures: match,
      };
    };
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.SyntaxError, "invalid RegExp");
    } else throw e;
  }

  // 12. Perform ? Set(obj, "lastIndex", 0, true).
  Properties.Set(realm, obj, "lastIndex", realm.intrinsics.zero, true);

  // 13. Return obj.
  return obj;
}

// ECMA262 21.2.5.2.1
export function RegExpExec(realm: Realm, R: ObjectValue, S: string): ObjectValue | NullValue {
  // 1. Assert: Type(R) is Object.
  invariant(R instanceof ObjectValue, "Type(R) is Object");

  // 2. Assert: Type(S) is String.
  invariant(typeof S === "string", "Type(S) is String");

  // 3. Let exec be ? Get(R, "exec").
  let exec = Get(realm, R, "exec");

  // 4. If IsCallable(exec) is true, then
  if (IsCallable(realm, exec)) {
    // a. Let result be ? Call(exec, R, « S »).
    let result = Call(realm, exec, R, [new StringValue(realm, S)]);

    // b. If Type(result) is neither Object or Null, throw a TypeError exception.
    if (!HasSomeCompatibleType(result, ObjectValue, NullValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(result) is neither Object or Null");
    }

    // c. Return result.
    return ((result.throwIfNotConcrete(): any): ObjectValue | NullValue);
  }

  // 5. If R does not have a [[RegExpMatcher]] internal slot, throw a TypeError exception.
  if (R.$RegExpMatcher === undefined) {
    throw realm.createErrorThrowCompletion(
      realm.intrinsics.TypeError,
      "R does not have a [[RegExpMatcher]] internal slot"
    );
  }

  // 6. Return ? RegExpBuiltinExec(R, S).
  return RegExpBuiltinExec(realm, R, S);
}

// ECMA262 21.2.5.2.2
export function RegExpBuiltinExec(realm: Realm, R: ObjectValue, S: string): ObjectValue | NullValue {
  // 1. Assert: R is an initialized RegExp instance.
  invariant(
    R.$RegExpMatcher !== undefined && R.$OriginalSource !== undefined && R.$OriginalFlags !== undefined,
    "R is an initialized RegExp instance"
  );

  // 2. Assert: Type(S) is String.
  invariant(typeof S === "string", "Type(S) is String");

  // 3. Let length be the number of code units in S.
  let length = S.length;

  // 4. Let lastIndex be ? ToLength(? Get(R, "lastIndex")).
  let lastIndex = To.ToLength(realm, Get(realm, R, "lastIndex"));

  // 5. Let flags be R.[[OriginalFlags]].
  let flags = R.$OriginalFlags;
  invariant(typeof flags === "string");

  // 6 .If flags contains "g", let global be true, else let global be false.
  let global = flags.indexOf("g") >= 0 ? true : false;

  // 7. If flags contains "y", let sticky be true, else let sticky be false.
  let sticky = flags.indexOf("y") >= 0 ? true : false;

  // 8. If global is false and sticky is false, let lastIndex be 0.
  if (global === false && sticky === false) lastIndex = 0;

  // 9. Let matcher be the value of R's [[RegExpMatcher]] internal slot.
  let matcher = R.$RegExpMatcher;
  invariant(matcher !== undefined);

  // 10. If flags contains "u", let fullUnicode be true, else let fullUnicode be false.
  let fullUnicode = flags.indexOf("u") >= 0 ? true : false;

  // 11. Let matchSucceeded be false.
  let matchSucceeded = false;

  let r = null;
  // 12. Repeat, while matchSucceeded is false
  while (!matchSucceeded) {
    // a. If lastIndex > length, then
    if (lastIndex > length) {
      // i. Perform ? Set(R, "lastIndex", 0, true).
      Properties.Set(realm, R, "lastIndex", realm.intrinsics.zero, true);
      // ii. Return null.
      return realm.intrinsics.null;
    }

    // b. Let r be matcher(S, lastIndex).
    r = matcher(S, lastIndex);

    // c. If r is failure, then
    if (r == null) {
      // i. If sticky is true, then
      if (sticky) {
        // 1. Perform ? Set(R, "lastIndex", 0, true).
        Properties.Set(realm, R, "lastIndex", realm.intrinsics.zero, true);

        // 2. Return null.
        return realm.intrinsics.null;
      }
      // ii. Let lastIndex be AdvanceStringIndex(S, lastIndex, fullUnicode).
      lastIndex = AdvanceStringIndex(realm, S, lastIndex, fullUnicode);
    } else {
      // d. Else,
      // i. Assert: r is a State.
      invariant(r, "r is a State");

      // ii. Set matchSucceeded to true.
      matchSucceeded = true;

      // (not in standard) Let lastIndex be the index of the captures
      lastIndex = (r.captures: any).index;
    }
  }
  invariant(r != null);

  // 13. Let e be r's endIndex value.
  let e = r.endIndex;

  // 14. If fullUnicode is true, then
  if (fullUnicode) {
    // TODO #1018 a. e is an index into the Input character list, derived from S, matched by matcher. Let eUTF be the smallest index into S that corresponds to the character at element e of Input. If e is greater than or equal to the length of Input, then eUTF is the number of code units in S.
    // b. Let e be eUTF.
  }

  // 15. If global is true or sticky is true, then
  if (global === true || sticky === true) {
    // a. Perform ? Set(R, "lastIndex", e, true).
    Properties.Set(realm, R, "lastIndex", new NumberValue(realm, e), true);
  }

  // 16. Let n be the length of r's captures List. (This is the same value as 21.2.2.1's NcapturingParens.)
  let n = r.captures.length - 1;

  // 17. Let A be ArrayCreate(n + 1).
  let A = Create.ArrayCreate(realm, n + 1);

  // 18. Assert: The value of A's "length" property is n + 1.
  let lengthOfA = Get(realm, A, "length").throwIfNotConcrete();
  invariant(lengthOfA instanceof NumberValue);
  invariant(lengthOfA.value === n + 1, 'The value of A\'s "length" property is n + 1');

  // 19. Let matchIndex be lastIndex.
  let matchIndex = lastIndex;

  // 20. Perform ! CreateDataProperty(A, "index", matchIndex).
  Create.CreateDataProperty(realm, A, "index", new NumberValue(realm, matchIndex));

  // 21. Perform ! CreateDataProperty(A, "input", S).
  Create.CreateDataProperty(realm, A, "input", new StringValue(realm, S));

  // 22. Let matchedSubstr be the matched substring (i.e. the portion of S between offset lastIndex inclusive and offset e exclusive).
  let matchedSubstr = S.substr(lastIndex, e - lastIndex);

  // 23. Perform ! CreateDataProperty(A, "0", matchedSubstr).
  Create.CreateDataProperty(realm, A, "0", new StringValue(realm, matchedSubstr));

  // 24. For each integer i such that i > 0 and i ≤ n
  for (let i = 1; i <= n; ++i) {
    // a. Let captureI be ith element of r's captures List.
    let captureI = r.captures[i];

    let capturedValue;
    // b. If captureI is undefined, let capturedValue be undefined.
    if (captureI === undefined) {
      capturedValue = realm.intrinsics.undefined;
    } else if (fullUnicode) {
      // c. Else if fullUnicode is true, then
      // TODO #1018: i. Assert: captureI is a List of code points.
      // ii. Let capturedValue be a string whose code units are the UTF16Encoding of the code points of captureI.
      capturedValue = realm.intrinsics.undefined;
    } else {
      // d. Else, fullUnicode is false,
      // i. Assert: captureI is a List of code units.
      invariant(typeof captureI === "string");

      // ii. Let capturedValue be a string consisting of the code units of captureI.
      capturedValue = new StringValue(realm, captureI);
    }

    // e. Perform ! CreateDataProperty(A, ! ToString(i), capturedValue).
    Create.CreateDataProperty(realm, A, To.ToString(realm, new NumberValue(realm, i)), capturedValue);
  }

  // 25. Return A.
  return A;
}

export function AdvanceStringIndex(realm: Realm, S: string, index: number, unicode: boolean): number {
  // 1. Assert: Type(S) is String.
  invariant(typeof S === "string", "Type(S) is String");

  // 2. Assert: index is an integer such that 0≤index≤253-1.
  invariant(index >= 0 && index <= Math.pow(2, 53) - 1, "index is an integer such that 0≤index≤253-1");

  // 3. Assert: Type(unicode) is Boolean.
  invariant(typeof unicode === "boolean", "Type(unicode) is Boolean");

  // 4. If unicode is false, return index+1.
  if (unicode === false) return index + 1;

  // 5. Let length be the number of code units in S.
  let length = S.length;

  // 6. If index+1 ≥ length, return index+1.
  if (index + 1 >= length) return index + 1;

  // 7. Let first be the code unit value at index index in S.
  let first = S.charCodeAt(index);

  // 8. If first < 0xD800 or first > 0xDBFF, return index+1.
  if (first < 0xd800 || first > 0xdbff) return index + 1;

  // 9. Let second be the code unit value at index index+1 in S.
  let second = S.charCodeAt(index + 1);

  // 10. If second < 0xDC00 or second > 0xDFFF, return index+1.
  if (second < 0xdc00 || second > 0xdfff) return index + 1;

  // 11. Return index+2.
  return index + 2;
}

export function EscapeRegExpPattern(realm: Realm, P: string, F: string): string {
  return P.replace("/", "/");
}
