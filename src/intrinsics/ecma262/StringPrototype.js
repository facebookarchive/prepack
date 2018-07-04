/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm } from "../../realm.js";
import { FatalError } from "../../errors.js";
import { AbstractValue, UndefinedValue, NumberValue, ObjectValue, StringValue, NullValue } from "../../values/index.js";
import { IsCallable, IsRegExp } from "../../methods/is.js";
import { GetMethod, GetSubstitution } from "../../methods/get.js";
import { Call, Invoke } from "../../methods/call.js";
import { Create, To } from "../../singletons.js";
import { RegExpCreate } from "../../methods/regexp.js";
import { SplitMatch, RequireObjectCoercible } from "../../methods/abstract.js";
import { HasSomeCompatibleType } from "../../methods/has.js";
import invariant from "../../invariant.js";
import buildExpressionTemplate from "../../utils/builder.js";

const sliceTemplateSrc = "(A).slice(B,C)";
const sliceTemplate = buildExpressionTemplate(sliceTemplateSrc);
const splitTemplateSrc = "(A).split(B,C)";
const splitTemplate = buildExpressionTemplate(splitTemplateSrc);

export default function(realm: Realm, obj: ObjectValue): ObjectValue {
  // ECMA262 21.1.3
  obj.$StringData = realm.intrinsics.emptyString;

  // ECMA262 21.1.3
  obj.defineNativeProperty("length", realm.intrinsics.zero);

  // ECMA262 21.1.3.1
  obj.defineNativeMethod("charAt", 1, (context, [pos]) => {
    // 1. Let O be ? RequireObjectCoercible(this value).
    let O = RequireObjectCoercible(realm, context);

    // 2. Let S be ? ToString(O).
    let S = To.ToString(realm, O.throwIfNotConcrete());

    // 3. Let position be ? ToInteger(pos).
    let position = To.ToInteger(realm, pos);

    // 4. Let size be the number of elements in S.
    let size = S.length;

    // 5. If position < 0 or position ≥ size, return the empty String.
    if (position < 0 || position >= size) return realm.intrinsics.emptyString;

    // 6. Return a String of length 1, containing one code unit from S, namely the code unit at index position.
    return new StringValue(realm, S.charAt(position));
  });

  // ECMA262 21.1.3.2
  obj.defineNativeMethod("charCodeAt", 1, (context, [pos]) => {
    // 1. Let O be ? RequireObjectCoercible(this value).
    let O = RequireObjectCoercible(realm, context);

    // 2. Let S be ? ToString(O).
    let S = To.ToString(realm, O.throwIfNotConcrete());

    // 3. Let position be ? ToInteger(pos).
    let position = To.ToInteger(realm, pos);

    // 4. Let size be the number of elements in S.
    let size = S.length;

    // 5. If position < 0 or position ≥ size, return NaN.
    if (position < 0 || position >= size) return realm.intrinsics.NaN;

    // 6. Return a value of Number type, whose value is the code unit value of the element at index position
    //    in the String S.
    return new NumberValue(realm, S.charCodeAt(position));
  });

  // ECMA262 21.1.3.3
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    obj.defineNativeMethod("codePointAt", 1, (context, [pos]) => {
      // 1. Let O be ? RequireObjectCoercible(this value).
      let O = RequireObjectCoercible(realm, context);

      // 2. Let S be ? ToString(O).
      let S = To.ToString(realm, O.throwIfNotConcrete());

      // 3. Let position be ? ToInteger(pos).
      let position = To.ToInteger(realm, pos);

      // 4. Let size be the number of elements in S.
      let size = S.length;

      // 5. If position < 0 or position ≥ size, return undefined.
      if (position < 0 || position >= size) return realm.intrinsics.undefined;

      // 6. Let first be the code unit value of the element at index position in the String S.
      // 7. If first < 0xD800 or first > 0xDBFF or position+1 = size, return first.
      // 8. Let second be the code unit value of the element at index position+1 in the String S.
      // 9. If second < 0xDC00 or second > 0xDFFF, return first.
      // 10. Return UTF16Decode(first, second).
      return new NumberValue(realm, S.codePointAt(position));
    });

  // ECMA262 21.1.3.4
  obj.defineNativeMethod("concat", 1, (context, args, argCount) => {
    // 1. Let O be ? RequireObjectCoercible(this value).
    let O = RequireObjectCoercible(realm, context);

    // 2. Let S be ? ToString(O).
    let S = To.ToString(realm, O.throwIfNotConcrete());

    // 3. Let args be a List whose elements are the arguments passed to this function.
    args = argCount === 0 ? [] : args;

    // 4. Let R be S.
    let R = S;

    // 5. Repeat, while args is not empty
    while (args.length) {
      // a. Remove the first element from args and let next be the value of that element.
      let next = args.shift();

      // b. Let nextString be ? ToString(next).
      let nextString = To.ToStringPartial(realm, next);

      // c. Let R be the String value consisting of the code units of the previous value of R followed by the code units of nextString.
      R = R + nextString;
    }

    // 6. Return R.
    return new StringValue(realm, R);
  });

  // ECMA262 21.1.3.6
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    obj.defineNativeMethod("endsWith", 1, (context, [searchString, endPosition]) => {
      // 1. Let O be ? RequireObjectCoercible(this value).
      let O = RequireObjectCoercible(realm, context);

      // 2. Let S be ? ToString(O).
      let S = To.ToString(realm, O.throwIfNotConcrete());

      // 3. Let isRegExp be ? IsRegExp(searchString).
      let isRegExp = IsRegExp(realm, searchString);

      // 4. If isRegExp is true, throw a TypeError exception.
      if (isRegExp) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "String.prototype");
      }

      // 5. Let searchStr be ? ToString(searchString).
      let searchStr = To.ToStringPartial(realm, searchString);

      // 6. Let len be the number of elements in S.
      let len = S.length;

      // 7. If endPosition is undefined, let pos be len, else let pos be ? ToInteger(endPosition).)
      let pos;
      if (!endPosition || endPosition instanceof UndefinedValue) {
        pos = len;
      } else {
        pos = To.ToInteger(realm, endPosition.throwIfNotConcrete());
      }

      // 8. Let end be min(max(pos, 0), len).
      let end = Math.min(Math.max(pos, 0), len);

      // 9. Let searchLength be the number of elements in searchStr.
      let searchLength = searchStr.length;

      // 10. Let start be end - searchLength.
      let start = end - searchLength;

      // 11. If start is less than 0, return false.
      if (start < 0) return realm.intrinsics.false;

      // 12. If the sequence of elements of S starting at start of length searchLength is the same as the full
      //     element sequence of searchStr, return true.
      if (S.substr(start, searchLength) === searchStr) return realm.intrinsics.true;

      // 13. Otherwise, return false.
      return realm.intrinsics.false;
    });

  // ECMA262 21.1.3.7
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    obj.defineNativeMethod("includes", 1, (context, [searchString, position]) => {
      // 1. Let O be ? RequireObjectCoercible(this value).
      let O = RequireObjectCoercible(realm, context);

      // 2. Let S be ? ToString(O).
      let S = To.ToString(realm, O.throwIfNotConcrete());

      // 3. Let isRegExp be ? IsRegExp(searchString).
      let isRegExp = IsRegExp(realm, searchString);

      // 4. If isRegExp is true, throw a TypeError exception.
      if (isRegExp) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "String.prototype");
      }

      // 5. Let searchStr be ? ToString(searchString).
      let searchStr = To.ToStringPartial(realm, searchString);

      // 6. Let pos be ? ToInteger(position). (If position is undefined, this step produces the value 0.)
      let pos = To.ToInteger(realm, position || realm.intrinsics.undefined);

      // 7. Let len be the number of elements in S.
      let len = S.length;

      // 8. Let start be min(max(pos, 0), len).
      let start = Math.min(Math.max(pos, 0), len);

      // 9. Let searchLen be the number of elements in searchStr.
      let searchLen = searchStr.length;

      // 10. If there exists any integer k not smaller than start such that k + searchLen is not greater than
      //     len, and for all nonnegative integers j less than searchLen, the code unit at index k+j of S is the
      //     same as the code unit at index j of searchStr, return true; but if there is no such integer k,
      //     return false.
      if (searchLen === 0) {
        return realm.intrinsics.true;
      } else {
        for (let k = start; k + searchLen <= len; ++k) {
          let found = true;
          for (let j = 0; j < searchLen; ++j) {
            if (S.charCodeAt(k + j) !== searchStr.charCodeAt(j)) {
              found = false;
            }
          }
          if (found) return realm.intrinsics.true;
        }
        return realm.intrinsics.false;
      }
    });

  // ECMA262 21.1.3.8
  obj.defineNativeMethod("indexOf", 1, (context, [searchString, position]) => {
    // 1. Let O be ? RequireObjectCoercible(this value).
    let O = RequireObjectCoercible(realm, context);

    // 2. Let S be ? ToString(O).
    let S = To.ToString(realm, O.throwIfNotConcrete());

    // 3. Let searchStr be ? ToString(searchString).
    let searchStr = To.ToStringPartial(realm, searchString);

    // 4. Let pos be ? ToInteger(position). (If position is undefined, this step produces the value 0.)
    let pos = position ? To.ToInteger(realm, position) : 0;

    // 5. Let len be the number of elements in S.
    // 6. Let start be min(max(pos, 0), len).
    // 7. Let searchLen be the number of elements in searchStr.
    // 8. Return the smallest possible integer k not smaller than start such that k+searchLen is not greater
    //    than len, and for all nonnegative integers j less than searchLen, the code unit at index k+j of S is
    //    the same as the code unit at index j of searchStr; but if there is no such integer k, return the
    //    value -1.
    return new NumberValue(realm, S.indexOf(searchStr, pos));
  });

  // ECMA262 21.1.3.9
  obj.defineNativeMethod("lastIndexOf", 1, (context, [searchString, position]) => {
    // 1. Let O be ? RequireObjectCoercible(this value).
    let O = RequireObjectCoercible(realm, context);

    // 2. Let S be ? ToString(O).
    let S = To.ToString(realm, O.throwIfNotConcrete());

    // 3. Let searchStr be ? ToString(searchString).
    let searchStr = To.ToStringPartial(realm, searchString);

    // 4. Let numPos be ? ToNumber(position). (If position is undefined, this step produces the value NaN.)
    let numPos = To.ToNumber(realm, position || realm.intrinsics.undefined);

    // 5. If numPos is NaN, let pos be +∞; otherwise, let pos be ToInteger(numPos).
    let pos;
    if (isNaN(numPos)) {
      pos = Infinity;
    } else {
      pos = To.ToInteger(realm, numPos);
    }

    // 6. Let len be the number of elements in S.
    // 7. Let start be min(max(pos, 0), len).
    // 8. Let searchLen be the number of elements in searchStr.
    // 9. Return the largest possible nonnegative integer k not larger than start such that k+searchLen is not
    //    greater than len, and for all nonnegative integers j less than searchLen, the code unit at index k+j
    //    of S is the same as the code unit at index j of searchStr; but if there is no such integer k, return
    //    the value -1.
    return new NumberValue(realm, S.lastIndexOf(searchStr, pos));
  });

  // ECMA262 21.1.3.10
  obj.defineNativeMethod("localeCompare", 1, (context, [that]) => {
    // 1. Let O be ? RequireObjectCoercible(this value).
    let O = RequireObjectCoercible(realm, context);

    // 2. Let S be ? ToString(O).
    let S = To.ToString(realm, O.throwIfNotConcrete());

    // 3. Let That be ? ToString(that).
    let That = To.ToStringPartial(realm, that);

    return new NumberValue(realm, S.localeCompare(That));
  });

  // ECMA262 21.1.3.11
  obj.defineNativeMethod("match", 1, (context, [regexp]) => {
    // 1. Let O be ? RequireObjectCoercible(this value).
    let O = RequireObjectCoercible(realm, context);

    // 2. If regexp is neither undefined nor null, then
    if (!HasSomeCompatibleType(regexp, UndefinedValue, NullValue)) {
      // a. Let matcher be ? GetMethod(regexp, @@match).
      let matcher = GetMethod(realm, regexp, realm.intrinsics.SymbolMatch);

      // b. If matcher is not undefined, then
      if (!matcher.mightBeUndefined()) {
        // i. Return ? Call(matcher, regexp, « O »).
        return Call(realm, matcher, regexp, [O]);
      }
      matcher.throwIfNotConcrete();
    }

    // 3. Let S be ? ToString(O).
    let S = new StringValue(realm, To.ToStringPartial(realm, O));

    // 4. Let rx be ? RegExpCreate(regexp, undefined).
    let rx = RegExpCreate(realm, regexp, undefined);

    // 5. Return ? Invoke(rx, @@match, « S »).
    return Invoke(realm, rx, realm.intrinsics.SymbolMatch, [S]);
  });

  // ECMA262 21.1.3.12
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    obj.defineNativeMethod("normalize", 0, (context, [form]) => {
      // 1. Let O be ? RequireObjectCoercible(this value).
      let O = RequireObjectCoercible(realm, context);

      // 2. Let S be ? ToString(O).
      let S = To.ToString(realm, O.throwIfNotConcrete());

      // 3. If form is not provided or form is undefined, let form be "NFC".
      if (!form || form instanceof UndefinedValue) form = new StringValue(realm, "NFC");

      // 4. Let f be ? ToString(form).
      let f = To.ToStringPartial(realm, form);

      // 5. If f is not one of "NFC", "NFD", "NFKC", or "NFKD", throw a RangeError exception.
      if (f !== "NFC" && f !== "NFD" && f !== "NFKC" && f !== "NFKD") {
        throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError);
      }

      // 6. Let ns be the String value that is the result of normalizing S into the normalization form named by
      //    f as specified in http://www.unicode.org/reports/tr15/tr15-29.html.
      // 7. Return ns.
      return new StringValue(realm, S.normalize(f));
    });

  // ECMA262 21.1.3.13
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    obj.defineNativeMethod("padEnd", 1, (context, [maxLength, fillString]) => {
      // 1. Let O be ? RequireObjectCoercible(this value).
      let O = RequireObjectCoercible(realm, context);

      // 2. Let S be ? ToString(O).
      let S = To.ToString(realm, O.throwIfNotConcrete());

      // 3. Let intMaxLength be ? ToLength(maxLength).
      let intMaxLength = To.ToLength(realm, maxLength);

      // 4. Let stringLength be the number of elements in S.
      let stringLength = S.length;

      // 5. If intMaxLength is not greater than stringLength, return S.
      if (intMaxLength <= stringLength) return new StringValue(realm, S);

      let filler;
      // 6. If fillString is undefined, let filler be a String consisting solely of the code unit 0x0020 (SPACE).
      if (!fillString || fillString instanceof UndefinedValue) filler = " ";
      else {
        // 7. Else, let filler be ? ToString(fillString).
        filler = To.ToStringPartial(realm, fillString);
      }
      // 8. If filler is the empty String, return S.
      if (filler === "") return new StringValue(realm, S);

      // 9. Let fillLen be intMaxLength - stringLength.
      let fillLen = intMaxLength - stringLength;

      // 10. Let truncatedStringFiller be a new String value consisting of repeated concatenations of filler truncated to length fillLen.
      let truncatedStringFiller = filler.repeat(Math.ceil(fillLen / filler.length)).substr(0, fillLen);

      // 11. Return a new String value computed by the concatenation of S and truncatedStringFiller.
      return new StringValue(realm, S + truncatedStringFiller);
    });

  // ECMA262 21.1.3.14
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    obj.defineNativeMethod("padStart", 1, (context, [maxLength, fillString]) => {
      // 1. Let O be ? RequireObjectCoercible(this value).
      let O = RequireObjectCoercible(realm, context);

      // 2. Let S be ? ToString(O).
      let S = To.ToString(realm, O.throwIfNotConcrete());

      // 3. Let intMaxLength be ? ToLength(maxLength).
      let intMaxLength = To.ToLength(realm, maxLength);

      // 4. Let stringLength be the number of elements in S.
      let stringLength = S.length;

      // 5. If intMaxLength is not greater than stringLength, return S.
      if (intMaxLength <= stringLength) return new StringValue(realm, S);

      let filler;
      // 6. If fillString is undefined, let filler be a String consisting solely of the code unit 0x0020 (SPACE).
      if (!fillString || fillString instanceof UndefinedValue) filler = " ";
      else {
        // 7. Else, let filler be ? ToString(fillString).
        filler = To.ToStringPartial(realm, fillString);
      }
      // 8. If filler is the empty String, return S.
      if (filler === "") return new StringValue(realm, S);

      // 9. Let fillLen be intMaxLength - stringLength.
      let fillLen = intMaxLength - stringLength;

      // 10. Let truncatedStringFiller be a new String value consisting of repeated concatenations of filler truncated to length fillLen.
      let truncatedStringFiller = filler.repeat(Math.ceil(fillLen / filler.length)).substr(0, fillLen);

      // 11. Return a new String value computed by the concatenation of truncatedStringFiller and S.
      return new StringValue(realm, truncatedStringFiller + S);
    });

  // ECMA262 21.1.3.13
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    obj.defineNativeMethod("repeat", 1, (context, [count]) => {
      // 1. Let O be ? RequireObjectCoercible(this value).
      let O = RequireObjectCoercible(realm, context);

      // 2. Let S be ? ToString(O).
      let S = To.ToString(realm, O.throwIfNotConcrete());

      // 3. Let n be ? ToInteger(count).
      let n = To.ToInteger(realm, count);

      // 4. If n < 0, throw a RangeError exception.
      if (n < 0) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError);
      }

      // 5. If n is +∞, throw a RangeError exception.
      if (!isFinite(n)) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError);
      }

      // 6. Let T be a String value that is made from n copies of S appended together. If n is 0, T is the empty String.
      let T = "";
      if (S) while (n--) T += S;

      // 7. Return T.
      return new StringValue(realm, T);
    });

  // ECMA262 21.1.3.14
  obj.defineNativeMethod("replace", 2, (context, [searchValue, replaceValue]) => {
    let replStr;

    // 1. Let O be ? RequireObjectCoercible(this value).
    let O = RequireObjectCoercible(realm, context);

    // 2. If searchValue is neither undefined nor null, then
    if (!HasSomeCompatibleType(searchValue, NullValue, UndefinedValue)) {
      // a. Let replacer be ? GetMethod(searchValue, @@replace).
      let replacer = GetMethod(realm, searchValue, realm.intrinsics.SymbolReplace);

      // b. If replacer is not undefined, then
      if (!(replacer instanceof UndefinedValue)) {
        // i. Return ? Call(replacer, searchValue, « O, replaceValue »).
        return Call(realm, replacer, searchValue, [O, replaceValue]);
      }
    }

    // 3. Let string be ? ToString(O).
    let string = To.ToString(realm, O.throwIfNotConcrete());

    // 4. Let searchString be ? ToString(searchValue).
    let searchString = To.ToStringPartial(realm, searchValue);

    // 5. Let functionalReplace be IsCallable(replaceValue).
    let functionalReplace = IsCallable(realm, replaceValue);

    let replaceValueString;
    // 6. If functionalReplace is false, then
    if (functionalReplace === false) {
      // a. Let replaceValue be ? ToString(replaceValue).
      replaceValueString = To.ToStringPartial(realm, replaceValue);
    }

    // 7. Search string for the first occurrence of searchString and
    //    let pos be the index within string of the first code unit of the matched substring and
    let pos = string.indexOf(searchString);

    //    let matched be searchString.
    let matched = searchString;

    //    If no occurrences of searchString were found, return string.
    if (pos < 0) return new StringValue(realm, string);

    // 8. If functionalReplace is true, then
    if (functionalReplace === true) {
      // a. Let replValue be ? Call(replaceValue, undefined, « matched, pos, string »).
      let replValue = Call(realm, replaceValue, realm.intrinsics.undefined, [
        new StringValue(realm, matched),
        new NumberValue(realm, pos),
        new StringValue(realm, string),
      ]);

      // b. Let replStr be ? ToString(replValue).
      replStr = To.ToStringPartial(realm, replValue);
    } else {
      // 9. Else,
      // a. Let captures be an empty List.
      let captures = [];

      // b. Let replStr be GetSubstitution(matched, string, pos, captures, replaceValue).
      invariant(typeof replaceValueString === "string");
      replStr = To.ToString(realm, GetSubstitution(realm, matched, string, pos, captures, replaceValueString));
    }

    // 10. Let tailPos be pos + the number of code units in matched.
    let tailPos = pos + matched.length;

    // 11. Let newString be the String formed by concatenating the first pos code units of string,
    //     replStr, and the trailing substring of string starting at index tailPos. If pos is 0,
    //     the first element of the concatenation will be the empty String.
    let newString = string.substr(0, pos) + replStr + string.substr(tailPos);

    // 12. Return newString.
    return new StringValue(realm, newString);
  });

  // ECMA262 21.1.3.15
  obj.defineNativeMethod("search", 1, (context, [regexp]) => {
    // 1. Let O be ? RequireObjectCoercible(this value).
    let O = RequireObjectCoercible(realm, context);

    // 2. If regexp is neither undefined nor null, then
    if (!HasSomeCompatibleType(regexp, UndefinedValue, NullValue)) {
      // a. Let searcher be ? GetMethod(regexp, @@search).
      let searcher = GetMethod(realm, regexp, realm.intrinsics.SymbolSearch);

      // b. If searcher is not undefined, then
      if (!(searcher instanceof UndefinedValue)) {
        // i. Return ? Call(searcher, regexp, « O »).
        return Call(realm, searcher, regexp, [O]);
      }
    }

    // 3. Let string be ? ToString(O).
    let string = To.ToStringPartial(realm, O);

    // 4. Let rx be ? RegExpCreate(regexp, undefined).
    let rx = RegExpCreate(realm, regexp, undefined);

    // 5. Return ? Invoke(rx, @@search, « string »).
    return Invoke(realm, rx, realm.intrinsics.SymbolSearch, [new StringValue(realm, string)]);
  });

  // ECMA262 21.1.3.16
  obj.defineNativeMethod("slice", 2, (context, [start, end]) => {
    // 1. Let O be ? RequireObjectCoercible(this value).
    let O = RequireObjectCoercible(realm, context);

    if (O instanceof AbstractValue && O.getType() === StringValue) {
      return AbstractValue.createFromTemplate(realm, sliceTemplate, StringValue, [O, start, end], sliceTemplateSrc);
    }

    // 2. Let S be ? ToString(O).
    let S = To.ToString(realm, O.throwIfNotConcrete());

    // 3. Let len be the number of elements in S.
    let len = S.length;

    // 4. Let intStart be ? ToInteger(start).
    let intStart = To.ToInteger(realm, start);

    // 5. If end is undefined, let intEnd be len; else let intEnd be ? ToInteger(end).
    let intEnd = !end || end instanceof UndefinedValue ? len : To.ToInteger(realm, end.throwIfNotConcrete());

    // 6. If intStart < 0, let from be max(len + intStart, 0); otherwise let from be min(intStart, len).
    let from = intStart < 0 ? Math.max(len + intStart, 0) : Math.min(intStart, len);

    // 7. If intEnd < 0, let to be max(len + intEnd, 0); otherwise let to be min(intEnd, len).
    let to = intEnd < 0 ? Math.max(len + intEnd, 0) : Math.min(intEnd, len);

    // 8. Let span be max(to - from, 0).
    let span = Math.max(to - from, 0);

    // 9. Return a String value containing span consecutive elements from S beginning with the element at index from.
    return new StringValue(realm, S.substr(from, span));
  });

  // ECMA262 21.1.3.17
  obj.defineNativeMethod("split", 2, (context, [separator, limit]) => {
    // 1. Let O be ? RequireObjectCoercible(this value).
    let O = RequireObjectCoercible(realm, context);

    if (O instanceof AbstractValue && O.getType() === StringValue) {
      return AbstractValue.createFromTemplate(
        realm,
        splitTemplate,
        StringValue,
        [O, separator, limit],
        splitTemplateSrc
      );
    }

    // 2. If separator is neither undefined nor null, then
    if (!HasSomeCompatibleType(separator, UndefinedValue, NullValue)) {
      // a. Let splitter be ? GetMethod(separator, @@split).
      let splitter = GetMethod(realm, separator, realm.intrinsics.SymbolSplit);

      // b. If splitter is not undefined, then
      if (!(splitter instanceof UndefinedValue)) {
        // i. Return ? Call(splitter, separator, « O, limit »).
        return Call(realm, splitter, separator, [O, limit]);
      }
    }

    // 3. Let S be ? ToString(O).
    let S = To.ToString(realm, O.throwIfNotConcrete());

    // 4. Let A be ArrayCreate(0).
    let A = Create.ArrayCreate(realm, 0);

    // 5. Let lengthA be 0.
    let lengthA = 0;

    // 6. If limit is undefined, let lim be 232-1; else let lim be ? ToUint32(limit).
    let lim =
      !limit || limit instanceof UndefinedValue ? Math.pow(2, 32) - 1 : To.ToUint32(realm, limit.throwIfNotConcrete());

    // 7. Let s be the number of elements in S.
    let s = S.length;

    // 8. Let p be 0.
    let p = 0;

    // 9. Let R be ? ToString(separator).
    let R = To.ToStringPartial(realm, separator);

    // 10. If lim = 0, return A.
    if (lim === 0) return A;

    // 11. If separator is undefined, then
    if (!separator || separator instanceof UndefinedValue) {
      // a. Perform ! CreateDataProperty(A, "0", S).
      Create.CreateDataProperty(realm, A, "0", new StringValue(realm, S));

      // b. Return A.
      return A;
    }

    // 12. If s = 0, then
    if (s === 0) {
      // a. Let z be SplitMatch(S, 0, R).
      let z = SplitMatch(realm, S, 0, R);

      // b. If z is not false, return A.
      if (z !== false) return A;

      // c. Perform ! CreateDataProperty(A, "0", S).
      Create.CreateDataProperty(realm, A, "0", new StringValue(realm, S));
      // d. Return A.
      return A;
    }

    // 13. Let q be p.
    let q = p;

    // 14. Repeat, while q ≠ s
    while (q !== s) {
      // a. Let e be SplitMatch(S, q, R).
      let e = SplitMatch(realm, S, q, R);

      // b. If e is false, let q be q+1.
      if (e === false) {
        q++;
      } else {
        // c. Else e is an integer index ≤ s,
        // i. If e = p, let q be q+1.
        if (e === p) {
          q++;
        } else {
          // ii. Else e ≠ p,
          // 1. Let T be a String value equal to the substring of S consisting of the code units at indices p (inclusive) through q (exclusive).
          let T = S.substring(p, q);

          // 2. Perform ! CreateDataProperty(A, ! ToString(lengthA), T).
          Create.CreateDataProperty(realm, A, new StringValue(realm, lengthA + ""), new StringValue(realm, T));

          // 3. Increment lengthA by 1.
          lengthA++;

          // 4. If lengthA = lim, return A.
          if (lengthA === lim) return A;

          // 5. Let p be e.
          p = e;

          // 6. Let q be p.
          q = p;
        }
      }
    }

    // 15. Let T be a String value equal to the substring of S consisting of the code units at indices p (inclusive) through s (exclusive).
    let T = S.substring(p, s);

    // 16. Perform ! CreateDataProperty(A, ! ToString(lengthA), T).
    Create.CreateDataProperty(realm, A, new StringValue(realm, lengthA + ""), new StringValue(realm, T));

    // 17. Return A.
    return A;
  });

  // ECMA262 21.1.3.18
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    obj.defineNativeMethod("startsWith", 1, (context, [searchString, position]) => {
      // 1. Let O be ? RequireObjectCoercible(this value).
      let O = RequireObjectCoercible(realm, context);

      // 2. Let S be ? ToString(O).
      let S = To.ToString(realm, O.throwIfNotConcrete());

      // 3. Let isRegExp be ? IsRegExp(searchString).
      let isRegExp = IsRegExp(realm, searchString);

      // 4. If isRegExp is true, throw a TypeError exception.
      if (isRegExp) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "String.prototype");
      }

      // 5. Let searchStr be ? ToString(searchString).
      let searchStr = To.ToStringPartial(realm, searchString);

      // 6. Let pos be ? ToInteger(position). (If position is undefined, this step produces the value 0.)
      let pos = To.ToInteger(realm, position || realm.intrinsics.undefined);

      // 7. Let len be the number of elements in S.
      let len = S.length;

      // 8. Let start be min(max(pos, 0), len).
      let start = Math.min(Math.max(pos, 0), len);

      // 9. Let searchLength be the number of elements in searchStr.
      let searchLength = searchStr.length;

      // 10. If searchLength+start is greater than len, return false.
      if (searchLength + start > len) return realm.intrinsics.false;

      // 11. If the sequence of elements of S starting at start of length searchLength is the same as the full element sequence of searchStr, return true.
      if (S.substr(start, searchLength) === searchStr) return realm.intrinsics.true;

      // 12. Otherwise, return false.
      return realm.intrinsics.false;
    });

  // ECMA262 21.1.3.19
  obj.defineNativeMethod("substring", 2, (context, [start, end]) => {
    // 1. Let O be ? RequireObjectCoercible(this value).
    let O = RequireObjectCoercible(realm, context);

    // 2. Let S be ? ToString(O).
    let S = To.ToString(realm, O.throwIfNotConcrete());

    // 3. Let len be the number of elements in S.
    let len = S.length;

    // 4. Let intStart be ? ToInteger(start).
    let intStart = To.ToInteger(realm, start);

    // 5. If end is undefined, let intEnd be len; else let intEnd be ? ToInteger(end).
    let intEnd = !end || end instanceof UndefinedValue ? len : To.ToInteger(realm, end.throwIfNotConcrete());

    // 6. Let finalStart be min(max(intStart, 0), len).
    let finalStart = Math.min(Math.max(intStart, 0), len);

    // 7. Let finalEnd be min(max(intEnd, 0), len).
    let finalEnd = Math.min(Math.max(intEnd, 0), len);

    // 8. Let from be min(finalStart, finalEnd).
    let frm = Math.min(finalStart, finalEnd);

    // 9. Let to be max(finalStart, finalEnd).
    let to = Math.max(finalStart, finalEnd);

    // 10. Return a String whose length is to - from, containing code units from S, namely the code units with indices from through to - 1, in ascending order.
    return new StringValue(realm, S.slice(frm, to));
  });

  type toCaseTypes = "LocaleLower" | "LocaleUpper" | "Lower" | "Upper";
  function toCase(type: toCaseTypes, context, locales) {
    // 1. Let O be RequireObjectCoercible(this value).
    let O = RequireObjectCoercible(realm, context);

    // 2. Let S be ToString(O)
    let S = To.ToString(realm, O.throwIfNotConcrete());

    if (realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) || realm.isCompatibleWith("mobile")) {
      locales = undefined;
    } else {
      // TODO #1013 filter locales for only serialisable values
      if (locales) locales = locales.serialize();
    }

    if (realm.useAbstractInterpretation && (type === "LocaleUpper" || type === "LocaleLower")) {
      // The locale is environment-dependent
      AbstractValue.reportIntrospectionError(O);
      throw new FatalError();
    }

    // Omit the rest of the arguments. Just use the native impl.
    return new StringValue(realm, (S: any)[`to${type}Case`](locales));
  }

  // ECMA-262 21.1.3.20
  // ECMA-402 13.1.2
  obj.defineNativeMethod("toLocaleLowerCase", 0, (context, [locales]) => {
    return toCase("LocaleLower", context, locales);
  });

  // ECMA-262 21.1.3.21
  // ECMA-402 13.1.3
  obj.defineNativeMethod("toLocaleUpperCase", 0, (context, [locales]) => {
    return toCase("LocaleUpper", context, locales);
  });

  // ECMA262 21.1.3.22
  obj.defineNativeMethod("toLowerCase", 0, context => {
    return toCase("Lower", context);
  });

  // ECMA262 21.1.3.23
  obj.defineNativeMethod("toString", 0, context => {
    const target = context instanceof ObjectValue ? context.$StringData : context;
    if (target instanceof AbstractValue && target.getType() === StringValue) {
      return target;
    }
    // 1. Return ? thisStringValue(this value).
    return To.thisStringValue(realm, context);
  });

  // ECMA262 21.1.3.24
  obj.defineNativeMethod("toUpperCase", 0, context => {
    return toCase("Upper", context);
  });

  // ECMA262 21.1.3.25
  obj.defineNativeMethod("trim", 0, context => {
    // 1. Let O be ? RequireObjectCoercible(this value).
    let O = RequireObjectCoercible(realm, context);

    // 2. Let S be ? ToString(O).
    let S = To.ToString(realm, O.throwIfNotConcrete());

    // 3. Let T be a String value that is a copy of S with both leading and trailing white space removed. The definition of white space is the union of WhiteSpace and LineTerminator. When determining whether a Unicode code point is in Unicode general category “Zs”, code unit sequences are interpreted as UTF-16 encoded code point sequences as specified in 6.1.4.
    let T = S.trim();

    // 4. Return T.
    return new StringValue(realm, T);
  });

  // ECMA262 21.1.3.26
  obj.defineNativeMethod("valueOf", 0, context => {
    // 1. Return ? thisStringValue(this value).
    return To.thisStringValue(realm, context);
  });

  // ECMA262 21.1.3.27
  obj.defineNativeMethod(realm.intrinsics.SymbolIterator, 0, context => {
    // 1. Let O be ? RequireObjectCoercible(this value).
    let O = RequireObjectCoercible(realm, context);

    // 2. Let S be ? ToString(O).
    let S = To.ToString(realm, O.throwIfNotConcrete());

    // 3. Return CreateStringIterator(S).
    return Create.CreateStringIterator(realm, new StringValue(realm, S));
  });

  // B.2.3.1
  obj.defineNativeMethod("substr", 2, (context, [start, length]) => {
    // 1. Let O be RequireObjectCoercible(this value).
    let O = RequireObjectCoercible(realm, context);

    // 2. Let S be ToString(O).
    let S = To.ToStringPartial(realm, O);

    // 3. ReturnIfAbrupt(S).

    // 4. Let intStart be ToInteger(start).
    let intStart = To.ToInteger(realm, start);

    // 5. ReturnIfAbrupt(intStart).

    // 6. If length is undefined, let end be +∞; otherwise let end be ToInteger(length).
    let end;
    if (!length || length instanceof UndefinedValue) {
      end = Infinity;
    } else {
      end = To.ToInteger(realm, length.throwIfNotConcrete());
    }

    // 7. ReturnIfAbrupt(end).

    // 8. Let size be the number of code units in S.
    let size = S.length;

    // 9. If intStart < 0, let intStart be max(size + intStart,0).
    if (intStart < 0) intStart = Math.max(size + intStart, 0);

    // 10. Let resultLength be min(max(end,0), size – intStart).
    let resultLength = Math.min(Math.max(end, 0), size - intStart);

    // 11. If resultLength ≤ 0, return the empty String "".
    if (resultLength <= 0) return realm.intrinsics.emptyString;

    // 12. Return a String containing resultLength consecutive code units from S beginning with the code unit at index intStart.
    return new StringValue(realm, S.slice(intStart, intStart + resultLength));
  });

  // B.2.3.2
  obj.defineNativeMethod("anchor", 1, (context, [name]) => {
    // 1. Let S be the this value.
    let S = context;

    // 2. // 2. Return ? CreateHTML(S, "a", "name", name).
    return Create.CreateHTML(realm, S, "a", "name", name);
  });

  // B.2.3.3
  obj.defineNativeMethod("big", 0, context => {
    // 1. Let S be the this value.
    let S = context;

    // 2. Return ? CreateHTML(S, "big", "", "").
    return Create.CreateHTML(realm, S, "big", "", "");
  });

  // B.2.3.4
  obj.defineNativeMethod("blink", 0, context => {
    // 1. Let S be the this value.
    let S = context;

    // 2. Return ? CreateHTML(S, "blink", "", "").
    return Create.CreateHTML(realm, S, "blink", "", "");
  });

  // B.2.3.5
  obj.defineNativeMethod("bold", 0, context => {
    // 1. Let S be the this value.
    let S = context;

    // 2. Return ? CreateHTML(S, "b", "", "").
    return Create.CreateHTML(realm, S, "b", "", "");
  });

  // B.2.3.6
  obj.defineNativeMethod("fixed", 0, context => {
    // 1. Let S be the this value.
    let S = context;

    // 2. Return ? CreateHTML(S, "tt", "", "").
    return Create.CreateHTML(realm, S, "tt", "", "");
  });

  // B.2.3.7
  obj.defineNativeMethod("fontcolor", 1, (context, [color]) => {
    // 1. Let S be the this value.
    let S = context;

    // 2. Return ? CreateHTML(S, "font", "color", color).
    return Create.CreateHTML(realm, S, "font", "color", color);
  });

  // B.2.3.8
  obj.defineNativeMethod("fontsize", 1, (context, [size]) => {
    // 1. Let S be the this value.
    let S = context;

    // 2. Return ? CreateHTML(S, "font", "size", size).
    return Create.CreateHTML(realm, S, "font", "size", size);
  });

  // B.2.3.9
  obj.defineNativeMethod("italics", 0, context => {
    // 1. Let S be the this value.
    let S = context;

    // 2. Return ? CreateHTML(S, "i", "", "").
    return Create.CreateHTML(realm, S, "i", "", "");
  });

  // B.2.3.10
  obj.defineNativeMethod("link", 1, (context, [url]) => {
    // 1. Let S be the this value.
    let S = context;

    // 2. Return ? CreateHTML(S, "a", "href", url).
    return Create.CreateHTML(realm, S, "a", "href", url);
  });

  // B.2.3.11
  obj.defineNativeMethod("small", 0, context => {
    // 1. Let S be the this value.
    let S = context;

    // 2. Return ? CreateHTML(S, "small", "", "").
    return Create.CreateHTML(realm, S, "small", "", "");
  });

  // B.2.3.12
  obj.defineNativeMethod("strike", 0, context => {
    // 1. Let S be the this value.
    let S = context;

    // 2. Return ? CreateHTML(S, "strike", "", "").
    return Create.CreateHTML(realm, S, "strike", "", "");
  });

  // B.2.3.13
  obj.defineNativeMethod("sub", 0, context => {
    // 1. Let S be the this value.
    let S = context;

    // 2. Return ? CreateHTML(S, "sub", "", "").
    return Create.CreateHTML(realm, S, "sub", "", "");
  });

  // B.2.3.14
  obj.defineNativeMethod("sup", 0, context => {
    // 1. Let S be the this value.
    let S = context;

    // 2. Return ? CreateHTML(S, "sup", "", "").
    return Create.CreateHTML(realm, S, "sup", "", "");
  });

  return obj;
}
