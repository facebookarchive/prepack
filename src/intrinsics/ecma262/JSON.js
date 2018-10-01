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
import {
  AbstractObjectValue,
  AbstractValue,
  ArrayValue,
  BooleanValue,
  NullValue,
  NumberValue,
  ObjectValue,
  PrimitiveValue,
  StringValue,
  UndefinedValue,
  Value,
} from "../../values/index.js";
import { Call, EnumerableOwnProperties, Get, HasSomeCompatibleType, IsArray, IsCallable } from "../../methods/index.js";
import { InternalizeJSONProperty } from "../../methods/json.js";
import { ValuesDomain } from "../../domains/index.js";
import { FatalError } from "../../errors.js";
import { Create, Properties, To } from "../../singletons.js";
import nativeToInterp from "../../utils/native-to-interp.js";
import invariant from "../../invariant.js";

type Context = {
  PropertyList?: Array<StringValue>,
  ReplacerFunction?: ObjectValue,
  stack: Array<ObjectValue>,
  indent: string,
  gap: string,
};

function SerializeJSONArray(realm: Realm, value: ObjectValue, context: Context): string {
  // 1. If stack contains value, throw a TypeError exception because the structure is cyclical.
  if (context.stack.indexOf(value) >= 0) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "cyclical error");
  }

  // 2. Append value to stack.
  context.stack.push(value);

  // 3. Let stepback be indent.
  let stepback = context.indent;

  // 4. Let indent be the concatenation of indent and gap.
  context.indent += context.gap;

  // 5. Let partial be a new empty List.
  let partial = [];

  // 6. Let len be ? ToLength(? Get(value, "length")).
  let len = To.ToLength(realm, Get(realm, value, "length"));

  // 7. Let index be 0.
  let index = 0;

  // 8. Repeat while index < len
  while (index < len) {
    // a. Let strP be ? SerializeJSONProperty(! ToString(index), value).
    let strP = SerializeJSONProperty(realm, new StringValue(realm, index + ""), value, context);

    // b. If strP is undefined, then
    if (strP === undefined) {
      // i. Append "null" to partial.
      partial.push("null");
    } else {
      // c. Else,
      // i. Append strP to partial.
      partial.push(strP);
    }

    // d. Increment index by 1.
    index++;
  }

  // 9. If partial is empty, then
  let final = "";
  if (!partial.length) {
    // a. Let final be "[]".
    final = "[]";
  } else {
    // 10. Else,
    // a. If gap is the empty String, then
    if (!context.gap) {
      // i. Let properties be a String formed by concatenating all the element Strings of partial with each adjacent pair of Strings separated with code unit 0x002C (COMMA). A comma is not inserted either before the first String or after the last String.
      let properties = partial.join(",");

      // ii. Let final be the result of concatenating "[", properties, and "]".
      final = `[${properties}]`;
    } else {
      // b. Else,
      // i. Let separator be the result of concatenating code unit 0x002C (COMMA), code unit 0x000A (LINE FEED), and indent.
      // ii. Let properties be a String formed by concatenating all the element Strings of partial with each adjacent pair of Strings separated with separator. The separator String is not inserted either before the first String or after the last String.
      // iii. Let final be the result of concatenating "[", code unit 0x000A (LINE FEED), indent, properties, code unit 0x000A (LINE FEED), stepback, and "]".
    }
  }

  // 11. Remove the last element of stack.
  context.stack.pop();

  // 12. Let indent be stepback.
  context.indent = stepback;

  // 13. Return final.
  return final;
}

function QuoteJSONString(realm: Realm, value: StringValue): string {
  return JSON.stringify(value.value);
}

function SerializeJSONObject(realm: Realm, value: ObjectValue, context: Context): string {
  // 1. If stack contains value, throw a TypeError exception because the structure is cyclical.
  if (context.stack.indexOf(value) >= 0) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "cyclical error");
  }

  // 2. Append value to stack.
  context.stack.push(value);

  // 3. Let stepback be indent.
  let stepback = context.indent;

  // 4. Let indent be the concatenation of indent and gap.
  context.indent += context.gap;

  // 5. If PropertyList is not undefined, then
  let K;
  if (context.PropertyList !== undefined) {
    // a. Let K be PropertyList.
    K = context.PropertyList;
  } else {
    // 6. Else,
    // a. Let K be ? EnumerableOwnProperties(value, "key").
    K = EnumerableOwnProperties(realm, value, "key");
  }

  // 7. Let partial be a new empty List.
  let partial = [];

  // 8. For each element P of K,
  for (let P of K) {
    invariant(P instanceof StringValue);

    // a. Let strP be ? SerializeJSONProperty(P, value).
    let strP = SerializeJSONProperty(realm, P, value, context);

    // b. If strP is not undefined, then
    if (strP !== undefined) {
      // i. Let member be QuoteJSONString(P).
      let member = QuoteJSONString(realm, P);

      // ii. Let member be the concatenation of member and the string ":".
      member += ":";

      // iii. If gap is not the empty String, then
      if (context.gap) {
        // 1. Let member be the concatenation of member and code unit 0x0020 (SPACE).
        member += " ";
      }

      // iv. Let member be the concatenation of member and strP.
      member += strP;

      // v. Append member to partial.
      partial.push(member);
    }
  }

  // 9. If partial is empty, then
  let final: string = "";
  if (!partial.length) {
    // a. Let final be "{}".
    final = "{}";
  } else {
    // 10. Else,
    // a. If gap is the empty String, then
    if (!context.gap) {
      // i. Let properties be a String formed by concatenating all the element Strings of partial with each adjacent pair of Strings separated with code unit 0x002C (COMMA). A comma is not inserted either before the first String or after the last String.
      let properties = partial.join(",");

      // ii. Let final be the result of concatenating "{", properties, and "}".
      final = `{${properties}}`;
    } else {
      // b. Else gap is not the empty String,
      // i. Let separator be the result of concatenating code unit 0x002C (COMMA), code unit 0x000A (LINE FEED), and indent.
      // ii. Let properties be a String formed by concatenating all the element Strings of partial with each adjacent pair of Strings separated with separator. The separator String is not inserted either before the first String or after the last String.
      // iii. Let final be the result of concatenating "{", code unit 0x000A (LINE FEED), indent, properties, code unit 0x000A (LINE FEED), stepback, and "}".
    }
  }

  // 11. Remove the last element of stack.
  context.stack.pop();

  // 12. Let indent be stepback.
  context.indent = stepback;

  // 13. Return final.
  return final;
}

function SerializeJSONProperty(realm: Realm, key: StringValue, holder: ObjectValue, context: Context): void | string {
  // 1. Let value be ? Get(holder, key).
  let value = Get(realm, holder, key).throwIfNotConcrete();

  // 2. If Type(value) is Object, then
  if (value instanceof ObjectValue) {
    // a. Let toJSON be ? Get(value, "toJSON").
    let toJSON = Get(realm, value, "toJSON");

    // b. If IsCallable(toJSON) is true, then
    if (IsCallable(realm, toJSON)) {
      // i. Let value be ? Call(toJSON, value, « key »).
      value = Call(realm, toJSON, value, [key]);
    }
  }

  // 3. If ReplacerFunction is not undefined, then
  if (context.ReplacerFunction) {
    // a. Let value be ? Call(ReplacerFunction, holder, « key, value »).
    value = Call(realm, context.ReplacerFunction, holder, [key, value]);
  }

  // 4. If Type(value) is Object, then
  if (value instanceof ObjectValue) {
    // a. If value has a [[NumberData]] internal slot, then
    if (value.$NumberData) {
      // b. Let value be ? ToNumber(value).
      value = new NumberValue(realm, To.ToNumber(realm, value));
    } else if (value.$StringData) {
      // c. Else if value has a [[StringData]] internal slot, then
      // d. Let value be ? ToString(value).
      value = new StringValue(realm, To.ToString(realm, value));
    } else if (value.$BooleanData) {
      // e. Else if value has a [[BooleanData]] internal slot, then
      // f. Let value be the value of the [[BooleanData]] internal slot of value.
      value = value.$BooleanData;
    }
  }

  // 5. If value is null, return "null".
  if (value instanceof NullValue) return "null";

  // 6. If value is true, return "true".
  if (value instanceof BooleanValue && value.value) return "true";

  // 7. If value is false, return "false".
  if (value instanceof BooleanValue && !value.value) return "false";

  // 8. If Type(value) is String, return QuoteJSONString(value).
  if (value instanceof StringValue) return QuoteJSONString(realm, value);

  // 9. If Type(value) is Number, then
  if (value instanceof NumberValue) {
    // a. If value is finite, return ! ToString(value).
    if (isFinite(value.value)) {
      return To.ToString(realm, value);
    } else {
      // b. Else, return "null".
      return "null";
    }
  }

  // 10. If Type(value) is Object and IsCallable(value) is false, then
  if (value instanceof ObjectValue && !IsCallable(realm, value)) {
    // a. Let isArray be ? IsArray(value).
    let isArray = IsArray(realm, value);

    // b. If isArray is true, return ? SerializeJSONArray(value).
    if (isArray) {
      return SerializeJSONArray(realm, value, context);
    } else {
      // c. Else, return ? SerializeJSONObject(value).
      return SerializeJSONObject(realm, value, context);
    }
  }

  // 1. Return undefined.
  return undefined;
}

function InternalCloneObject(realm: Realm, val: ObjectValue): ObjectValue {
  let clone = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  for (let [key, binding] of val.properties) {
    if (binding === undefined || binding.descriptor === undefined) continue; // deleted
    let desc = binding.descriptor;
    invariant(desc !== undefined);
    Properties.ThrowIfMightHaveBeenDeleted(desc);
    let value = desc.throwIfNotConcrete(realm).value;
    if (value === undefined) {
      AbstractValue.reportIntrospectionError(val, key); // cannot handle accessors
      throw new FatalError();
    }
    invariant(value instanceof Value);
    Create.CreateDataProperty(realm, clone, key, InternalJSONClone(realm, value));
  }
  if (val.isPartialObject()) clone.makePartial();
  if (val.isSimpleObject()) clone.makeSimple();
  clone.isScopedTemplate = true; // because this object doesn't exist ahead of time, and the visitor would otherwise declare it in the common scope
  return clone;
}

const JSONStringifyStr = "global.JSON.stringify(A)";
const JSONParseStr = "global.JSON.parse(A)";

function InternalJSONClone(realm: Realm, val: Value): Value {
  if (val instanceof AbstractValue) {
    if (val instanceof AbstractObjectValue) {
      let strVal = AbstractValue.createFromTemplate(realm, JSONStringifyStr, StringValue, [val]);
      let obVal = AbstractValue.createFromTemplate(realm, JSONParseStr, ObjectValue, [strVal]);
      obVal.values = new ValuesDomain(new Set([InternalCloneObject(realm, val.getTemplate())]));
      return obVal;
    }
    // TODO #1010: NaN and Infinity must be mapped to null.
    return val;
  }
  if (val instanceof NumberValue && !isFinite(val.value)) {
    return realm.intrinsics.null;
  }
  if (val instanceof PrimitiveValue) {
    return val;
  }
  if (val instanceof ObjectValue) {
    let clonedObj;
    let isArray = IsArray(realm, val);
    if (isArray === true) {
      clonedObj = Create.ObjectCreate(realm, realm.intrinsics.ArrayPrototype);
      let I = 0;
      let len = To.ToLength(realm, Get(realm, val, "length"));
      while (I < len) {
        let P = To.ToString(realm, new NumberValue(realm, I));
        let newElement = Get(realm, val, P);
        if (!(newElement instanceof UndefinedValue)) {
          // TODO #1011: An abstract value that ultimately yields undefined should still be skipped
          Create.CreateDataProperty(realm, clonedObj, P, InternalJSONClone(realm, newElement));
        }
        I += 1;
      }
    } else {
      clonedObj = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
      let keys = EnumerableOwnProperties(realm, val, "key", true);
      for (let P of keys) {
        invariant(P instanceof StringValue);
        let newElement = Get(realm, val, P);
        if (!(newElement instanceof UndefinedValue)) {
          // TODO #1011: An abstract value that ultimately yields undefined should still be skipped
          Create.CreateDataProperty(realm, clonedObj, P, InternalJSONClone(realm, newElement));
        }
      }
    }
    if (val.isPartialObject()) clonedObj.makePartial();
    clonedObj.makeSimple(); // The result of a JSON clone is always simple
    return clonedObj;
  }
  invariant(false);
}

export default function(realm: Realm): ObjectValue {
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "JSON");

  // ECMA262 24.3.3
  obj.defineNativeProperty(realm.intrinsics.SymbolToStringTag, new StringValue(realm, "JSON"), { writable: false });

  // ECMA262 24.3.2
  obj.defineNativeMethod("stringify", 3, (context, [value, _replacer, _space]) => {
    let replacer = _replacer.throwIfNotConcrete();
    let space = _space.throwIfNotConcrete();

    // 1. Let stack be a new empty List.
    let stack = [];

    // 2. Let indent be the empty String.
    let indent = "";

    // 3. Let PropertyList and ReplacerFunction be undefined.
    let PropertyList, ReplacerFunction;

    // 4. If Type(replacer) is Object, then
    if (replacer instanceof ObjectValue) {
      // a. If IsCallable(replacer) is true, then
      if (IsCallable(realm, replacer)) {
        // i. Let ReplacerFunction be replacer.
        ReplacerFunction = replacer;
      } else {
        // b. Else,
        // i. Let isArray be ? IsArray(replacer).
        let isArray = IsArray(realm, replacer);

        // ii. If isArray is true, then
        if (isArray === true) {
          // i. Let PropertyList be a new empty List.
          PropertyList = [];

          // ii. Let len be ? ToLength(? Get(replacer, "length")).
          let len = To.ToLength(realm, Get(realm, replacer, "length"));

          // iii. Let k be 0.
          let k = 0;

          // iv. Repeat while k<len,
          while (k < len) {
            // 1. Let v be ? Get(replacer, ! ToString(k)).
            let v = Get(realm, replacer, new StringValue(realm, k + ""));
            v = v.throwIfNotConcrete();

            // 2. Let item be undefined.
            let item;

            // 3. If Type(v) is String, let item be v.
            if (v instanceof StringValue) {
              item = v;
            } else if (v instanceof NumberValue) {
              // 4. Else if Type(v) is Number, let item be ! ToString(v).
              item = new StringValue(realm, To.ToString(realm, v));
            } else if (v instanceof ObjectValue) {
              // 5. Else if Type(v) is Object, then
              // a. If v has a [[StringData]] or [[NumberData]] internal slot, let item be ? ToString(v).
              if (v.$StringData || v.$NumberData) {
                item = new StringValue(realm, To.ToString(realm, v));
              }
            }

            // 6. If item is not undefined and item is not currently an element of PropertyList, then
            if (item !== undefined && PropertyList.find(x => x.value === item.value) === undefined) {
              // a. Append item to the end of PropertyList.
              PropertyList.push(item);
            }

            // 7. Let k be k+1.
            k++;
          }
        }
      }
    }

    // 5. If Type(space) is Object, then
    if (space instanceof ObjectValue) {
      // a. If space has a [[NumberData]] internal slot, then
      if (space.$NumberData) {
        // i. Let space be ? ToNumber(space).
        space = new NumberValue(realm, To.ToNumber(realm, space));
      } else if (space.$StringData) {
        // b. Else if space has a [[StringData]] internal slot, then
        // i. Let space be ? ToString(space).
        space = new StringValue(realm, To.ToString(realm, space));
      }
    }

    let gap;
    // 6. If Type(space) is Number, then
    if (space instanceof NumberValue) {
      // a. Let space be min(10, ToInteger(space)).
      space = new NumberValue(realm, Math.min(10, To.ToInteger(realm, space)));

      // b. Set gap to a String containing space occurrences of code unit 0x0020 (SPACE). This will be the empty String if space is less than 1.
      gap = Array(Math.max(0, space.value)).join(" ");
    } else if (space instanceof StringValue) {
      // 7. Else if Type(space) is String, then
      // a. If the number of elements in space is 10 or less, set gap to space; otherwise set gap to a String consisting of the first 10 elements of space.
      gap = space.value.length <= 10 ? space.value : space.value.substring(0, 10);
    } else {
      // 8. Else,
      // a. Set gap to the empty String.
      gap = "";
    }

    // 9. Let wrapper be ObjectCreate(%ObjectPrototype%).
    let wrapper = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

    let isAbstract = value instanceof AbstractValue;

    // #2411
    if (isAbstract && value.values.isTop()) {
      AbstractValue.reportIntrospectionError(value);
      throw new FatalError();
    }

    // TODO #1012: Make result abstract if any nested element is an abstract value.
    if (isAbstract || (value instanceof ObjectValue && value.isPartialObject())) {
      // Return abstract result. This enables cloning via JSON.parse(JSON.stringify(...)).
      let clonedValue = InternalJSONClone(realm, value);
      let result = AbstractValue.createTemporalFromTemplate(realm, JSONStringifyStr, StringValue, [clonedValue], {
        kind: "JSON.stringify(...)",
      });
      return result;
    }

    // 10. Let status be CreateDataProperty(wrapper, the empty String, value).
    let status = Create.CreateDataProperty(realm, wrapper, "", value);

    // 11. Assert: status is true.
    invariant(status, "expected to create data property");

    // 12. Return ? SerializeJSONProperty(the empty String, wrapper).
    let str = SerializeJSONProperty(realm, realm.intrinsics.emptyString, wrapper, {
      PropertyList,
      ReplacerFunction,
      stack,
      indent,
      gap,
    });
    if (str === undefined) {
      return realm.intrinsics.undefined;
    } else {
      return new StringValue(realm, str);
    }
  });

  // ECMA262 24.3.1
  obj.defineNativeMethod("parse", 2, (context, [text, reviver]) => {
    let unfiltered;
    if (text instanceof AbstractValue && text.kind === "JSON.stringify(...)") {
      // Enable cloning via JSON.parse(JSON.stringify(...)).
      // text is abstract, so we are doing abstract interpretation
      let temporalOperationEntryArgs = realm.derivedIds.get(text.intrinsicName);
      invariant(temporalOperationEntryArgs !== undefined);
      let args = temporalOperationEntryArgs.args;
      invariant(args[0] instanceof Value); // since text.kind === "JSON.stringify(...)"
      let inputClone = args[0]; // A temporal copy of the object that was the argument to stringify
      // Clone it so that every call to parse produces a different instance from stringify's clone
      let parseResult; // A clone of inputClone, because every call to parse produces a new object
      if (inputClone instanceof ObjectValue) {
        parseResult = InternalCloneObject(realm, inputClone);
      } else {
        invariant(inputClone instanceof AbstractObjectValue);
        parseResult = InternalCloneObject(realm, inputClone.getTemplate());
      }
      invariant(parseResult.isPartialObject()); // Because stringify ensures it
      parseResult.makeSimple(); // because the result of JSON.parse is always simple
      // Force evaluation of the parse call
      unfiltered = AbstractValue.createTemporalFromTemplate(realm, JSONParseStr, ObjectValue, [text], {
        kind: "JSON.parse(...)",
      });
      unfiltered.values = new ValuesDomain(new Set([parseResult]));
      invariant(unfiltered.intrinsicName !== undefined);
      invariant(realm.generator);
      realm.rebuildNestedProperties(unfiltered, unfiltered.intrinsicName);
    } else {
      // 1. Let JText be ? ToString(text).
      let JText = To.ToStringPartial(realm, text);

      // 2. Parse JText interpreted as UTF-16 encoded Unicode points (6.1.4) as a JSON text as specified in ECMA-404. Throw a SyntaxError exception if JText is not a valid JSON text as defined in that specification.
      // 3. Let scriptText be the result of concatenating "(", JText, and ");".
      // 4. Let completion be the result of parsing and evaluating scriptText as if it was the source text of an ECMAScript Script, but using the alternative definition of DoubleStringCharacter provided below. The extended PropertyDefinitionEvaluation semantics defined in B.3.1 must not be used during the evaluation.
      // 5. Let unfiltered be completion.[[Value]].
      try {
        unfiltered = nativeToInterp(realm, JSON.parse(JText));
      } catch (err) {
        if (err instanceof SyntaxError) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.SyntaxError, err.message);
        } else {
          throw err;
        }
      }

      // 6. Assert: unfiltered will be either a primitive value or an object that is defined by either an ArrayLiteral or an ObjectLiteral.
      invariant(
        HasSomeCompatibleType(unfiltered, PrimitiveValue, ObjectValue, ArrayValue),
        "expected primitive, object or array"
      );
    }

    // 7. If IsCallable(reviver) is true, then
    if (IsCallable(realm, reviver)) {
      // a. Let root be ObjectCreate(%ObjectPrototype%).
      let root = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

      // b. Let rootName be the empty String.
      let rootName = "";

      // c. Let status be CreateDataProperty(root, rootName, unfiltered).
      let status = Create.CreateDataProperty(realm, root, rootName, unfiltered);

      // d. Assert: status is true.
      invariant(status, "expected to create data property");

      // e. Return ? InternalizeJSONProperty(root, rootName).
      return InternalizeJSONProperty(realm, reviver, root, rootName);
    } else {
      // 8. Else,
      // a. Return unfiltered.
      return unfiltered;
    }
  });

  return obj;
}
