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
import invariant from "../../invariant.js";
import {
  BooleanValue,
  StringValue,
  ObjectValue,
  NullValue,
  NumberValue,
  UndefinedValue,
  Value,
} from "../../values/index.js";
import { SameValue } from "../../methods/abstract.js";
import { Call } from "../../methods/call.js";
import { Construct, SpeciesConstructor } from "../../methods/construct.js";
import { Get, GetSubstitution } from "../../methods/get.js";
import { Create, Properties, To } from "../../singletons.js";
import { IsCallable } from "../../methods/is.js";
import { RegExpBuiltinExec, RegExpExec, EscapeRegExpPattern, AdvanceStringIndex } from "../../methods/regexp.js";

function InternalHasFlag(realm: Realm, context: Value, flag: string): Value {
  // 1. Let R be the this value.
  let R = context.throwIfNotConcrete();

  // 2. If Type(R) is not Object, throw a TypeError exception.
  if (!(R instanceof ObjectValue)) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(R) is not an object");
  }

  // 3. If R does not have an [[OriginalFlags]] internal slot, throw a TypeError exception.
  if (typeof R.$OriginalFlags !== "string") {
    // a. If SameValue(R, %RegExpPrototype%) is true, return undefined.
    if (SameValue(realm, R, realm.intrinsics.RegExpPrototype)) {
      return realm.intrinsics.undefined;
    } else {
      // b. Otherwise, throw a TypeError exception.
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "R does not have an [[OriginalFlags]] internal slot"
      );
    }
  }

  // 4. Let flags be the value of R's [[OriginalFlags]] internal slot.
  let flags = R.$OriginalFlags;

  // 5. If flags contains the code unit "g", return true.
  if (flags.indexOf(flag) >= 0) {
    return realm.intrinsics.true;
  }

  // 6. Return false.
  return realm.intrinsics.false;
}

export default function(realm: Realm, obj: ObjectValue): void {
  // ECMA262 21.2.5.2
  obj.defineNativeMethod("exec", 1, (context, [string]) => {
    // 1. Let R be the this value.
    let R = context.throwIfNotConcrete();

    // 2. If Type(R) is not Object, throw a TypeError exception.
    if (!(R instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(R) is not an object");
    }

    // 3. If R does not have a [[RegExpMatcher]] internal slot, throw a TypeError exception.
    if (R.$RegExpMatcher === undefined) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "R does not have a [[RegExpMatcher]] internal slot"
      );
    }

    // 4. Let S be ? ToString(string).
    let S = To.ToStringPartial(realm, string);

    // 5. Return ? RegExpBuiltinExec(R, S).
    return RegExpBuiltinExec(realm, R, S);
  });

  // ECMA262 21.2.5.3
  obj.defineNativeGetter("flags", context => {
    // 1. Let R be the this value.
    let R = context.throwIfNotConcrete();

    // 2. If Type(R) is not Object, throw a TypeError exception.
    if (!(R instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(R) is not an object");
    }

    // 3. Let result be the empty String.
    let result = "";

    // 4. Let global be ToBoolean(? Get(R, "global")).
    let global = To.ToBooleanPartial(realm, Get(realm, R, "global"));

    // 5. If global is true, append "g" as the last code unit of result.
    if (global) result += "g";

    // 6. Let ignoreCase be ToBoolean(? Get(R, "ignoreCase")).
    let ignoreCase = To.ToBooleanPartial(realm, Get(realm, R, "ignoreCase"));

    // 7. If ignoreCase is true, append "i" as the last code unit of result.
    if (ignoreCase) result += "i";

    // 8. Let multiline be ToBoolean(? Get(R, "multiline")).
    let multiline = To.ToBooleanPartial(realm, Get(realm, R, "multiline"));

    // 9. If multiline is true, append "m" as the last code unit of result.
    if (multiline) result += "m";

    // 10. Let unicode be ToBoolean(? Get(R, "unicode")).
    let unicode = To.ToBooleanPartial(realm, Get(realm, R, "unicode"));

    // 11. If unicode is true, append "u" as the last code unit of result.
    if (unicode) result += "u";

    // 12. Let sticky be ToBoolean(? Get(R, "sticky")).
    let sticky = To.ToBooleanPartial(realm, Get(realm, R, "sticky"));

    // 13. If sticky is true, append "y" as the last code unit of result.
    if (sticky) result += "y";

    // 14. Return result.
    return new StringValue(realm, result);
  });

  // ECMA262 21.2.5.4
  obj.defineNativeGetter("global", context => {
    return InternalHasFlag(realm, context, "g");
  });

  // ECMA262 21.2.5.5
  obj.defineNativeGetter("ignoreCase", context => {
    return InternalHasFlag(realm, context, "i");
  });

  // ECMA262 21.2.5.6
  obj.defineNativeMethod(realm.intrinsics.SymbolMatch, 1, (context, [string]) => {
    // 1. Let rx be the this value.
    let rx = context.throwIfNotConcrete();

    // 2. If Type(rx) is not Object, throw a TypeError exception.
    if (!(rx instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(R) is not an object");
    }

    // 3. Let S be ? ToString(string).
    let S = To.ToStringPartial(realm, string);

    // 4. Let global be ToBoolean(? Get(rx, "global")).
    let global = To.ToBooleanPartial(realm, Get(realm, rx, "global"));

    // 5. If global is false, then
    if (global === false) {
      // a. Return ? RegExpExec(rx, S).
      return RegExpExec(realm, rx, S);
    } else {
      // 6. Else global is true,
      // a. Let fullUnicode be ToBoolean(? Get(rx, "unicode")).
      let fullUnicode = To.ToBooleanPartial(realm, Get(realm, rx, "unicode"));

      // b. Perform ? Set(rx, "lastIndex", 0, true).
      Properties.Set(realm, rx, "lastIndex", realm.intrinsics.zero, true);

      // c. Let A be ArrayCreate(0).
      let A = Create.ArrayCreate(realm, 0);

      // d. Let n be 0.
      let n = 0;

      // e. Repeat,
      while (true) {
        // i. Let result be ? RegExpExec(rx, S).
        let result = RegExpExec(realm, rx, S);

        // ii. If result is null, then
        if (result instanceof NullValue) {
          // 1. If n=0, return null.
          if (n === 0) {
            return realm.intrinsics.null;
          } else {
            // 2. Else, return A.
            return A;
          }
        } else {
          // iii. Else result is not null,
          // 1. Let matchStr be ? ToString(? Get(result, "0")).
          let matchStr = To.ToStringPartial(realm, Get(realm, result, "0"));

          // 2. Let status be CreateDataProperty(A, ! ToString(n), matchStr).
          let status = Create.CreateDataProperty(
            realm,
            A,
            To.ToString(realm, new NumberValue(realm, n)),
            new StringValue(realm, matchStr)
          );

          // 3. Assert: status is true.
          invariant(status === true, "status is true");

          // 4. If matchStr is the empty String, then
          if (matchStr === "") {
            // a. Let thisIndex be ? ToLength(? Get(rx, "lastIndex")).
            let thisIndex = To.ToLength(realm, Get(realm, rx, "lastIndex"));

            // b. Let nextIndex be AdvanceStringIndex(S, thisIndex, fullUnicode).
            let nextIndex = AdvanceStringIndex(realm, S, thisIndex, fullUnicode);

            // c .Perform ? Set(rx, "lastIndex", nextIndex, true).
            Properties.Set(realm, rx, "lastIndex", new NumberValue(realm, nextIndex), true);
          }

          // 5. Increment n.
          n += 1;
        }
      }

      invariant(false);
    }
  });

  // ECMA262 21.2.5.7
  obj.defineNativeGetter("multiline", context => {
    return InternalHasFlag(realm, context, "m");
  });

  // ECMA262 21.2.5.8
  obj.defineNativeMethod(realm.intrinsics.SymbolReplace, 2, (context, [string, _replaceValue]) => {
    let replaceValue = _replaceValue;
    // 1. Let rx be the this value.
    let rx = context.throwIfNotConcrete();

    // 2. If Type(rx) is not Object, throw a TypeError exception.
    if (!(rx instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(R) is not an object");
    }

    // 3. Let S be ? ToString(string).
    let S = To.ToStringPartial(realm, string);

    // 4. Let lengthS be the number of code unit elements in S.
    let lengthS = S.length;

    // 5. Let functionalReplace be IsCallable(replaceValue).
    let functionalReplace = IsCallable(realm, replaceValue);

    // 6. If functionalReplace is false, then
    if (functionalReplace === false) {
      // a. Let replaceValue be ? ToString(replaceValue).
      replaceValue = new StringValue(realm, To.ToStringPartial(realm, replaceValue));
    }

    // 7. Let global be ToBoolean(? Get(rx, "global")).
    let global = To.ToBooleanPartial(realm, Get(realm, rx, "global"));

    let fullUnicode;
    // 8. If global is true, then
    if (global === true) {
      // a. Let fullUnicode be ToBoolean(? Get(rx, "unicode")).
      fullUnicode = To.ToBooleanPartial(realm, Get(realm, rx, "unicode"));

      // b. Perform ? Set(rx, "lastIndex", 0, true).
      Properties.Set(realm, rx, "lastIndex", realm.intrinsics.zero, true);
    }

    // 9. Let results be a new empty List.
    let results = [];

    // 10. Let done be false.
    let done = false;

    // 11. Repeat, while done is false
    while (done === false) {
      // a. Let result be ? RegExpExec(rx, S).
      let result = RegExpExec(realm, rx, S);

      // b. If result is null, set done to true.
      if (result instanceof NullValue) {
        done = true;
      } else {
        // c. Else result is not null,
        // i. Append result to the end of results.
        results.push(result);

        // ii. If global is false, set done to true.
        if (global === false) {
          done = true;
        } else {
          // iii. Else,
          invariant(fullUnicode !== undefined);

          // 1. Let matchStr be ? ToString(? Get(result, "0")).
          let matchStr = To.ToStringPartial(realm, Get(realm, result, "0"));

          // 2. If matchStr is the empty String, then
          if (matchStr === "") {
            // a. Let thisIndex be ? ToLength(? Get(rx, "lastIndex")).
            let thisIndex = To.ToLength(realm, Get(realm, rx, "lastIndex"));

            // b. Let nextIndex be AdvanceStringIndex(S, thisIndex, fullUnicode).
            let nextIndex = AdvanceStringIndex(realm, S, thisIndex, fullUnicode);

            // c. Perform ? Set(rx, "lastIndex", nextIndex, true).
            Properties.Set(realm, rx, "lastIndex", new NumberValue(realm, nextIndex), true);
          }
        }
      }
    }

    // 12. Let accumulatedResult be the empty String value.
    let accumulatedResult = "";

    // 13. Let nextSourcePosition be 0.
    let nextSourcePosition = 0;

    // 14. Repeat, for each result in results,
    for (let result of results) {
      // a. Let nCaptures be ? ToLength(? Get(result, "length")).
      let nCaptures = To.ToLength(realm, Get(realm, result, "length"));

      // b. Let nCaptures be max(nCaptures - 1, 0).
      nCaptures = Math.max(nCaptures - 1, 0);

      // c. Let matched be ? ToString(? Get(result, "0")).
      let matched = To.ToStringPartial(realm, Get(realm, result, "0"));

      // d. Let matchLength be the number of code units in matched.
      let matchLength = matched.length;

      // e. Let position be ? ToInteger(? Get(result, "index")).
      let position = To.ToInteger(realm, Get(realm, result, "index"));

      // f. Let position be max(min(position, lengthS), 0).
      position = Math.max(Math.min(position, lengthS), 0);

      // g. Let n be 1.
      let n = 1;

      // h. Let captures be a new empty List.
      let captures = [];

      // i. Repeat while n ≤ nCaptures
      while (n <= nCaptures) {
        // i. Let capN be ? Get(result, ! ToString(n)).
        let capN = Get(realm, result, To.ToString(realm, new NumberValue(realm, n)));

        // ii. If capN is not undefined, then
        if (!capN.mightBeUndefined()) {
          // 1. Let capN be ? ToString(capN).
          capN = To.ToStringPartial(realm, capN);
        } else {
          capN.throwIfNotConcrete();
          capN = undefined;
        }

        // iii. Append capN as the last element of captures.
        captures.push(capN);

        // iv. Let n be n+1.
        n = n + 1;
      }

      let replacement;
      // j. If functionalReplace is true, then
      if (functionalReplace) {
        // i. Let replacerArgs be « matched ».
        let replacerArgs = [new StringValue(realm, matched)];

        // ii. Append in list order the elements of captures to the end of the List replacerArgs.
        for (let capture of captures) {
          replacerArgs.push(capture === undefined ? realm.intrinsics.undefined : new StringValue(realm, capture));
        }

        // iii. Append position and S as the last two elements of replacerArgs.
        replacerArgs = replacerArgs.concat([new NumberValue(realm, position), new StringValue(realm, S)]);

        // iv. Let replValue be ? Call(replaceValue, undefined, replacerArgs).
        let replValue = Call(realm, replaceValue, realm.intrinsics.undefined, replacerArgs);

        // v. Let replacement be ? ToString(replValue).
        replacement = To.ToStringPartial(realm, replValue);
      } else {
        // k. Else,
        invariant(replaceValue instanceof StringValue);
        // i. Let replacement be GetSubstitution(matched, S, position, captures, replaceValue).
        replacement = GetSubstitution(realm, matched, S, position, captures, replaceValue.value);
      }

      // l. If position ≥ nextSourcePosition, then
      if (position >= nextSourcePosition) {
        // i. NOTE position should not normally move backwards. If it does, it is an indication of an ill-behaving RegExp subclass or use of an access triggered side-effect to change the global flag or other characteristics of rx. In such cases, the corresponding substitution is ignored.
        // ii. Let accumulatedResult be the String formed by concatenating the code units of the current value of accumulatedResult with the substring of S consisting of the code units from nextSourcePosition (inclusive) up to position (exclusive) and with the code units of replacement.
        accumulatedResult =
          accumulatedResult + S.substr(nextSourcePosition, position - nextSourcePosition) + replacement;

        // iii. Let nextSourcePosition be position + matchLength.
        nextSourcePosition = position + matchLength;
      }
    }
    // 15. If nextSourcePosition ≥ lengthS, return accumulatedResult.
    if (nextSourcePosition >= lengthS) return new StringValue(realm, accumulatedResult);

    // 16. Return the String formed by concatenating the code units of accumulatedResult with the substring of S consisting of the code units from nextSourcePosition (inclusive) up through the final code unit of S (inclusive).
    return new StringValue(realm, accumulatedResult + S.substr(nextSourcePosition));
  });

  // ECMA262 21.2.5.9
  obj.defineNativeMethod(realm.intrinsics.SymbolSearch, 1, (context, [string]) => {
    // 1. Let rx be the this value.
    let rx = context.throwIfNotConcrete();

    // 2. If Type(rx) is not Object, throw a TypeError exception.
    if (!(rx instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(R) is not an object");
    }

    // 3. Let S be ? ToString(string).
    let S = To.ToStringPartial(realm, string);

    // 4. Let previousLastIndex be ? Get(rx, "lastIndex").
    let previousLastIndex = Get(realm, rx, "lastIndex");

    // 5. Perform ? Set(rx, "lastIndex", 0, true).
    Properties.Set(realm, rx, "lastIndex", realm.intrinsics.zero, true);

    // 6. Let result be ? RegExpExec(rx, S).
    let result = RegExpExec(realm, rx, S);

    // 7. Perform ? Set(rx, "lastIndex", previousLastIndex, true).
    Properties.Set(realm, rx, "lastIndex", previousLastIndex, true);

    // 8. If result is null, return -1.
    if (result instanceof NullValue) return new NumberValue(realm, -1);

    // 9. Return ? Get(result, "index").
    return Get(realm, result, "index");
  });

  // ECMA262 21.2.5.10
  obj.defineNativeGetter("source", context => {
    // 1. Let R be the this value.
    let R = context.throwIfNotConcrete();

    // 2. If Type(R) is not Object, throw a TypeError exception.
    if (!(R instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(R) is not an object");
    }

    // 3. If R does not have an [[OriginalSource]] internal slot, throw a TypeError exception.
    if (typeof R.$OriginalSource !== "string") {
      // a. If SameValue(R, %RegExpPrototype%) is true, return undefined.
      if (SameValue(realm, R, realm.intrinsics.RegExpPrototype)) {
        return new StringValue(realm, "(?:)");
      } else {
        // b. Otherwise, throw a TypeError exception.
        throw realm.createErrorThrowCompletion(
          realm.intrinsics.TypeError,
          "R does not have an [[OriginalSource]] internal slot"
        );
      }
    }

    // 4. Assert: R has an [[OriginalFlags]] internal slot.
    invariant(R.$OriginalFlags !== undefined, "R has an [[OriginalFlags]] internal slot");

    // 5. Let src be R.[[OriginalSource]].
    let src = R.$OriginalSource;
    invariant(typeof src === "string");

    // 6. Let flags be R.[[OriginalFlags]].
    let flags = R.$OriginalFlags;
    invariant(typeof flags === "string");

    // 7. Return EscapeRegExpPattern(src, flags).
    return new StringValue(realm, EscapeRegExpPattern(realm, src, flags));
  });

  // ECMA262 21.2.5.11
  obj.defineNativeMethod(realm.intrinsics.SymbolSplit, 2, (context, [string, limit]) => {
    // 1. Let rx be the this value.
    let rx = context.throwIfNotConcrete();

    // 2. If Type(rx) is not Object, throw a TypeError exception.
    if (!(rx instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(rx) is not an object");
    }

    // 3. Let S be ? ToString(string).
    let S = To.ToStringPartial(realm, string);

    // 4. Let C be ? SpeciesConstructor(rx, %RegExp%).
    let C = SpeciesConstructor(realm, rx, realm.intrinsics.RegExp);

    // 5. Let flags be ? ToString(? Get(rx, "flags")).
    let flags = To.ToStringPartial(realm, Get(realm, rx, "flags"));

    let unicodeMatching;
    // 6. If flags contains "u", let unicodeMatching be true.
    if (flags.indexOf("u") >= 0) {
      unicodeMatching = true;
    } else {
      // 7. Else, let unicodeMatching be false.
      unicodeMatching = false;
    }

    let newFlags;
    // 8. If flags contains "y", let newFlags be flags.
    if (flags.indexOf("y") >= 0) {
      newFlags = flags;
    } else {
      // 9. Else, let newFlags be the string that is the concatenation of flags and "y".
      newFlags = flags + "y";
    }

    // 10. Let splitter be ? Construct(C, « rx, newFlags »).
    let splitter = Construct(realm, C, [rx, new StringValue(realm, newFlags)]).throwIfNotConcreteObject();

    // 11. Let A be ArrayCreate(0).
    let A = Create.ArrayCreate(realm, 0);

    // 12. Let lengthA be 0.
    let lengthA = 0;

    // 13. If limit is undefined, let lim be 2^32-1; else let lim be ? ToUint32(limit).
    let lim = limit instanceof UndefinedValue ? Math.pow(2, 32) - 1 : To.ToUint32(realm, limit.throwIfNotConcrete());

    // 14. Let size be the number of elements in S.
    let size = S.length;

    // 15. Let p be 0.
    let p = 0;

    // 16. If lim = 0, return A.
    if (lim === 0) return A;

    // 17. If size = 0, then
    if (size === 0) {
      // a. Let z be ? RegExpExec(splitter, S).
      let z = RegExpExec(realm, splitter, S);

      // b. If z is not null, return A.
      if (!(z instanceof NullValue)) return A;

      // c. Perform ! CreateDataProperty(A, "0", S).
      Create.CreateDataProperty(realm, A, "0", new StringValue(realm, S));

      // d Return A.
      return A;
    }

    // 18. Let q be p.
    let q = p;

    // 19. Repeat, while q < size
    while (q < size) {
      // a. Perform ? Set(splitter, "lastIndex", q, true).
      Properties.Set(realm, splitter, "lastIndex", new NumberValue(realm, q), true);

      // b. Let z be ? RegExpExec(splitter, S).
      let z = RegExpExec(realm, splitter, S);

      // c. If z is null, let q be AdvanceStringIndex(S, q, unicodeMatching).
      if (z instanceof NullValue) {
        q = AdvanceStringIndex(realm, S, q, unicodeMatching);
      } else {
        // d. Else z is not null,
        // i. Let e be ? ToLength(? Get(splitter, "lastIndex")).
        let e = To.ToLength(realm, Get(realm, splitter, "lastIndex"));

        // ii. Let e be min(e, size).
        e = Math.min(e, size);

        // iii. If e = p, let q be AdvanceStringIndex(S, q, unicodeMatching).
        if (e === p) {
          q = AdvanceStringIndex(realm, S, q, unicodeMatching);
        } else {
          // iv. Else e ≠ p,
          // 1. Let T be a String value equal to the substring of S consisting of the elements at indices p (inclusive) through q (exclusive).
          let T = S.substr(p, q - p);

          // 2. Perform ! CreateDataProperty(A, ! ToString(lengthA), T).
          Create.CreateDataProperty(
            realm,
            A,
            To.ToString(realm, new NumberValue(realm, lengthA)),
            new StringValue(realm, T)
          );

          // 3. Let lengthA be lengthA + 1.
          lengthA = lengthA + 1;

          // 4. If lengthA = lim, return A.
          if (lengthA === lim) return A;

          // 5. Let p be e.
          p = e;

          // 6. Let numberOfCaptures be ? ToLength(? Get(z, "length")).
          let numberOfCaptures = To.ToLength(realm, Get(realm, z, "length"));

          // 7. Let numberOfCaptures be max(numberOfCaptures-1, 0).
          numberOfCaptures = Math.max(numberOfCaptures - 1, 0);

          // 8. Let i be 1.
          let i = 1;

          // 9. Repeat, while i ≤ numberOfCaptures,
          while (i <= numberOfCaptures) {
            // a. Let nextCapture be ? Get(z, ! ToString(i)).
            let nextCapture = Get(realm, z, To.ToString(realm, new NumberValue(realm, i)));

            // b. Perform ! CreateDataProperty(A, ! ToString(lengthA), nextCapture).
            Create.CreateDataProperty(realm, A, To.ToString(realm, new NumberValue(realm, lengthA)), nextCapture);

            // c. Let i be i + 1.
            i = i + 1;

            // d. Let lengthA be lengthA + 1.
            lengthA = lengthA + 1;

            // e. If lengthA = lim, return A.
            if (lengthA === lim) return A;
          }

          // 10. Let q be p.
          q = p;
        }
      }
    }

    // 20. Let T be a String value equal to the substring of S consisting of the elements at indices p (inclusive) through size (exclusive).
    let T = S.substr(p, size - p);

    // 21. Perform ! CreateDataProperty(A, ! ToString(lengthA), T).
    Create.CreateDataProperty(realm, A, To.ToString(realm, new NumberValue(realm, lengthA)), new StringValue(realm, T));

    // 22. Return A.
    return A;
  });

  // ECMA262 21.2.5.12
  obj.defineNativeGetter("sticky", context => {
    return InternalHasFlag(realm, context, "y");
  });

  // ECMA262 21.2.5.13
  obj.defineNativeMethod("test", 1, (context, [S]) => {
    // 1. Let R be the this value.
    let R = context.throwIfNotConcrete();

    // 2. If Type(R) is not Object, throw a TypeError exception.
    if (!(R instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(R) is not an object");
    }

    // 3. Let string be ? ToString(S).
    let string = To.ToStringPartial(realm, S);

    // 4. Let match be ? RegExpExec(R, string).
    let match = RegExpExec(realm, R, string);

    // 5. If match is not null, return true; else return false.
    return new BooleanValue(realm, !(match instanceof NullValue) ? true : false);
  });

  // ECMA262 21.2.5.14
  obj.defineNativeMethod("toString", 0, context => {
    // 1. Let R be the this value.
    let R = context.throwIfNotConcrete();

    // 2. If Type(R) is not Object, throw a TypeError exception.
    if (!(R instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(R) is not an object");
    }

    // 3. Let pattern be ? ToString(? Get(R, "source")).
    let pattern = To.ToStringPartial(realm, Get(realm, R, "source"));

    // 4. Let flags be ? ToString(? Get(R, "flags")).
    let flags = To.ToStringPartial(realm, Get(realm, R, "flags"));

    // 5. Let result be the String value formed by concatenating "/", pattern, "/", and flags.
    let result = "/" + pattern + "/" + flags;

    // 6. Return result.
    return new StringValue(realm, result);
  });

  // ECMA262 21.2.5.15
  obj.defineNativeGetter("unicode", context => {
    return InternalHasFlag(realm, context, "u");
  });
}
