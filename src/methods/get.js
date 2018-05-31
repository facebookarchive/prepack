/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { AbruptCompletion, PossiblyNormalCompletion } from "../completions.js";
import { InfeasiblePathError } from "../errors.js";
import { construct_empty_effects, type Realm, Effects } from "../realm.js";
import type { PropertyKeyValue, CallableObjectValue } from "../types.js";
import {
  AbstractObjectValue,
  AbstractValue,
  ArrayValue,
  BoundFunctionValue,
  EmptyValue,
  NullValue,
  NumberValue,
  ObjectValue,
  ProxyValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "../values/index.js";
import { Reference } from "../environment.js";
import { FatalError } from "../errors.js";
import { SetIntegrityLevel } from "./integrity.js";
import {
  Call,
  HasSomeCompatibleType,
  IsAccessorDescriptor,
  IsCallable,
  IsDataDescriptor,
  IsPropertyKey,
} from "./index.js";
import { Create, Environment, Join, Path, To } from "../singletons.js";
import invariant from "../invariant.js";
import type { BabelNodeTemplateLiteral } from "babel-types";
import * as t from "babel-types";

// ECMA262 7.3.22
export function GetFunctionRealm(realm: Realm, obj: ObjectValue): Realm {
  // 1. Assert: obj is a callable object.
  invariant(IsCallable(realm, obj), "expected callable object");

  // ProxyValue moved to realm before
  // https://github.com/facebook/prepack/pull/1351

  // 4. If obj is a Proxy exotic object, then
  if (obj instanceof ProxyValue) {
    // a. If the value of the [[ProxyHandler]] internal slot of obj is null, throw a TypeError exception.
    if (obj.$ProxyHandler instanceof NullValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "proxy handler is null");
    }
    invariant(obj.$ProxyTarget instanceof ObjectValue);

    // b. Let proxyTarget be the value of obj's [[ProxyTarget]] internal slot.
    let proxyTarget = obj.$ProxyTarget;

    // c. Return ? GetFunctionRealm(proxyTarget).
    return GetFunctionRealm(realm, proxyTarget);
  }

  // 2. If obj has a [[Realm]] internal slot, then
  if (obj.$Realm) {
    // a. Return obj's [[Realm]] internal slot.
    return obj.$Realm;
  }

  // 3. If obj is a Bound Function exotic object, then
  if (obj instanceof BoundFunctionValue) {
    // a. Let target be obj's [[BoundTargetFunction]] internal slot.
    let target = obj.$BoundTargetFunction;

    // b. Return ? GetFunctionRealm(target).
    return GetFunctionRealm(realm, target);
  }

  // 5. Return the current Realm Record.
  return realm;
}

// ECMA262 9.1.8.1
export function OrdinaryGet(
  realm: Realm,
  O: ObjectValue,
  P: PropertyKeyValue,
  Receiver: Value,
  dataOnly?: boolean
): Value {
  // 1. Assert: IsPropertyKey(P) is true.
  invariant(IsPropertyKey(realm, P), "expected property key");

  // 2. Let desc be ? O.[[GetOwnProperty]](P).
  let desc = O.$GetOwnProperty(P);
  if (desc === undefined || desc.joinCondition === undefined) return OrdinaryGetHelper();

  // joined descriptors need special treatment
  let joinCondition = desc.joinCondition;
  let descriptor1 = desc.descriptor1;
  let descriptor2 = desc.descriptor2;
  joinCondition = realm.simplifyAndRefineAbstractCondition(joinCondition);
  if (!joinCondition.mightNotBeTrue()) {
    desc = descriptor1;
    return OrdinaryGetHelper();
  }
  if (!joinCondition.mightNotBeFalse()) {
    desc = desc.descriptor2;
    return OrdinaryGetHelper();
  }
  invariant(joinCondition instanceof AbstractValue);
  let result1, generator1, modifiedBindings1, modifiedProperties1, createdObjects1;
  try {
    desc = descriptor1;
    ({
      result: result1,
      generator: generator1,
      modifiedBindings: modifiedBindings1,
      modifiedProperties: modifiedProperties1,
      createdObjects: createdObjects1,
    } = Path.withCondition(joinCondition, () => {
      return desc !== undefined
        ? realm.evaluateForEffects(() => OrdinaryGetHelper(), undefined, "OrdinaryGet/1")
        : construct_empty_effects(realm);
    }));
  } catch (e) {
    if (e instanceof InfeasiblePathError) {
      // The joinCondition cannot be true in the current path, after all
      desc = descriptor2;
      return OrdinaryGetHelper();
    } else {
      throw e;
    }
  }
  let result2, generator2, modifiedBindings2, modifiedProperties2, createdObjects2;
  try {
    desc = descriptor2;
    ({
      result: result2,
      generator: generator2,
      modifiedBindings: modifiedBindings2,
      modifiedProperties: modifiedProperties2,
      createdObjects: createdObjects2,
    } = Path.withInverseCondition(joinCondition, () => {
      return desc !== undefined
        ? realm.evaluateForEffects(() => OrdinaryGetHelper(), undefined, "OrdinaryGet/2")
        : construct_empty_effects(realm);
    }));
  } catch (e) {
    if (e instanceof InfeasiblePathError) {
      // The joinCondition cannot be false in the current path, after all
      desc = descriptor1;
      return OrdinaryGetHelper();
    } else {
      throw e;
    }
  }
  // Join the effects, creating an abstract view of what happened, regardless
  // of the actual value of ownDesc.joinCondition.
  let joinedEffects = Join.joinForkOrChoose(
    realm,
    joinCondition,
    new Effects(result1, generator1, modifiedBindings1, modifiedProperties1, createdObjects1),
    new Effects(result2, generator2, modifiedBindings2, modifiedProperties2, createdObjects2)
  );
  let completion = joinedEffects.result;
  if (completion instanceof PossiblyNormalCompletion) {
    // in this case one of the branches may complete abruptly, which means that
    // not all control flow branches join into one flow at this point.
    // Consequently we have to continue tracking changes until the point where
    // all the branches come together into one.
    completion = realm.composeWithSavedCompletion(completion);
  }
  // Note that the effects of (non joining) abrupt branches are not included
  // in joinedEffects, but are tracked separately inside completion.
  realm.applyEffects(joinedEffects);

  // return or throw completion
  if (completion instanceof AbruptCompletion) throw completion;
  invariant(completion instanceof Value);
  return completion;

  function OrdinaryGetHelper() {
    let descValue = !desc
      ? realm.intrinsics.undefined
      : desc.value === undefined
        ? realm.intrinsics.undefined
        : desc.value;
    invariant(descValue instanceof Value);

    // 3. If desc is undefined, then
    if (!desc || descValue.mightHaveBeenDeleted()) {
      // a. Let parent be ? O.[[GetPrototypeOf]]().
      let parent = O.$GetPrototypeOf();

      // b. If parent is null, return undefined.
      if (parent instanceof NullValue) {
        // Return the property value since it is now known to be the right value
        // even in the case when it is empty.
        return descValue;
      }

      // c. Return ? parent.[[Get]](P, Receiver).
      if (descValue.mightHaveBeenDeleted() && descValue instanceof AbstractValue) {
        // We don't know for sure that O.P does not exist.
        let parentVal = OrdinaryGet(realm, parent.throwIfNotConcreteObject(), P, descValue, true);
        if (parentVal instanceof UndefinedValue)
          // even O.P returns undefined it is still the right value.
          return descValue;
        // Join with parent value with descValue because the actual value will be
        // descValue unless it is empty.
        // Only get the parent value if it does not involve a getter call.
        // Use a property get for the joined value since it does the check for empty.
        let cond = AbstractValue.createFromBinaryOp(realm, "!==", descValue, realm.intrinsics.empty);
        return Join.joinValuesAsConditional(realm, cond, descValue, parentVal);
      }
      invariant(!desc || descValue instanceof EmptyValue);
      return parent.$Get(P, Receiver);
    }

    // 4. If IsDataDescriptor(desc) is true, return desc.[[Value]].
    if (IsDataDescriptor(realm, desc)) return descValue;
    if (dataOnly) {
      invariant(descValue instanceof AbstractValue);
      AbstractValue.reportIntrospectionError(descValue);
      throw new FatalError();
    }

    // 5. Assert: IsAccessorDescriptor(desc) is true.
    invariant(IsAccessorDescriptor(realm, desc), "expected accessor descriptor");

    // 6. Let getter be desc.[[Get]].
    let getter = desc.get;

    // 7. If getter is undefined, return undefined.
    if (!getter || getter instanceof UndefinedValue) return realm.intrinsics.undefined;

    // 8. Return ? Call(getter, Receiver).
    return Call(realm, getter, Receiver);
  }
}

// ECMA262 8.3.6
export function GetGlobalObject(realm: Realm): ObjectValue | AbstractObjectValue {
  // 1. Let ctx be the running execution context.
  let ctx = realm.getRunningContext();

  // 2. Let currentRealm be ctx's Realm.
  let currentRealm = ctx.realm;

  // 3. Return currentRealm.[[GlobalObject]].
  return currentRealm.$GlobalObject;
}

// ECMA262 21.1.3.14.1
export function GetSubstitution(
  realm: Realm,
  matched: string,
  str: string,
  position: number,
  captures: Array<string | void>,
  replacement: string
): string {
  // 1. Assert: Type(matched) is String.
  invariant(typeof matched === "string", "expected matched to be a stirng");

  // 2. Let matchLength be the number of code units in matched.
  let matchLength = matched.length;

  // 3. Assert: Type(str) is String.
  invariant(typeof str === "string", "expected matched to be a stirng");

  // 4. Let stringLength be the number of code units in str.
  let stringLength = str.length;

  // 5. Assert: position is a nonnegative integer.
  invariant(position >= 0, "expected position to be a nonegative integer");

  // 6. Assert: position ≤ stringLength.
  invariant(position <= stringLength, "expected position to be less than string length");

  // 7. Assert: captures is a possibly empty List of Strings.
  invariant(Array.isArray(captures), "expected captures to be an array");

  // 8. Assert: Type(replacement) is String.
  invariant(typeof replacement === "string", "expected replacement to be a stirng");

  // 9. Let tailPos be position + matchLength.
  let tailPos = position + matchLength;

  // 10. Let m be the number of elements in captures.
  let m = captures.length;

  // 11. Let result be a String value derived from replacement by copying code unit elements
  //     from replacement to result while performing replacements as specified in Table 46.
  //     These $ replacements are done left-to-right, and, once such a replacement is performed,
  //     the new replacement text is not subject to further replacements.
  let result = "";
  for (let i = 0; i < replacement.length; ++i) {
    let ch = replacement.charAt(i);
    if (ch !== "$" || i + 1 >= replacement.length) {
      result += ch;
      continue;
    }
    let peek = replacement.charAt(i + 1);
    if (peek === "&") {
      result += matched;
    } else if (peek === "$") {
      result += "$";
    } else if (peek === "`") {
      result += str.substr(0, position);
    } else if (peek === "'") {
      result += str.substr(tailPos);
    } else if (peek >= "0" && peek <= "9") {
      let idx = peek.charCodeAt(0) - "0".charCodeAt(0);
      if (i + 2 < replacement.length) {
        let peek2 = replacement.charAt(i + 2);
        if (peek2 >= "0" && peek2 <= "9") {
          let newIdx = idx * 10 + (peek2.charCodeAt(0) - "0".charCodeAt(0));
          if (newIdx <= m) {
            idx = newIdx;
            i += 1;
          }
        }
      }
      if (idx > 0 && idx <= m) {
        result += captures[idx - 1] || "";
      } else {
        result += "$" + idx;
      }
    } else {
      result += "$" + peek;
    }
    i += 1;
  }

  // 12. Return result.
  return result;
}

// ECMA262 7.3.9
export function GetMethod(realm: Realm, V: Value, P: PropertyKeyValue): UndefinedValue | CallableObjectValue {
  // 1. Assert: IsPropertyKey(P) is true.
  invariant(IsPropertyKey(realm, P), "expected property key");

  // 2. Let func be ? GetV(V, P).
  let func = GetV(realm, V, P);

  // 3. If func is either undefined or null, return undefined.
  if (HasSomeCompatibleType(func, NullValue, UndefinedValue)) {
    return realm.intrinsics.undefined;
  }

  // 4. If IsCallable(func) is false, throw a TypeError exception.
  if (!IsCallable(realm, func)) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not callable");
  }

  // 5. Return func.
  return ((func: any): CallableObjectValue);
}

// ECMA262 9.1.14
export function GetPrototypeFromConstructor(
  realm: Realm,
  constructor: ObjectValue,
  intrinsicDefaultProto: string
): ObjectValue | AbstractObjectValue {
  // 1. Assert: intrinsicDefaultProto is a String value that is this specification's name of an intrinsic
  //   object. The corresponding object must be an intrinsic that is intended to be used as the [[Prototype]]
  //   value of an object.
  invariant(realm.intrinsics[intrinsicDefaultProto], "not a valid proto ref");

  // 2. Assert: IsCallable(constructor) is true.
  invariant(IsCallable(realm, constructor) === true, "expected constructor to be callable");

  // 3. Let proto be ? Get(constructor, "prototype").
  let proto = Get(realm, constructor, new StringValue(realm, "prototype"));

  // 4. If Type(proto) is not Object, then
  if (!(proto instanceof ObjectValue) && !(proto instanceof AbstractObjectValue)) {
    // a. Let realm be ? GetFunctionRealm(constructor).
    realm = GetFunctionRealm(realm, constructor);

    // b. Let proto be realm's intrinsic object named intrinsicDefaultProto.
    proto = realm.intrinsics[intrinsicDefaultProto];
  }

  // 5. Return proto.
  return proto;
}

// ECMA262 7.3.1
export function Get(realm: Realm, O: ObjectValue | AbstractObjectValue, P: PropertyKeyValue): Value {
  // 1. Assert: Type(O) is Object.
  invariant(O instanceof ObjectValue || O instanceof AbstractObjectValue, "Not an object value");

  // 2. Assert: IsPropertyKey(P) is true.
  invariant(IsPropertyKey(realm, P), "Not a valid property key");

  // 3. Return ? O.[[Get]](P, O).
  return O.$Get(P, O);
}

// ECMA262 7.3.2
export function GetV(realm: Realm, V: Value, P: PropertyKeyValue): Value {
  // 1. Assert: IsPropertyKey(P) is true.
  invariant(IsPropertyKey(realm, P), "Not a valid property key");

  // 2. Let O be ? ToObject(V).
  let O = To.ToObject(realm, V);

  // 3. Return ? O.[[Get]](P, V).
  return O.$Get(P, V);
}

// ECMA262 6.2.3.3
export function GetThisValue(realm: Realm, V: Reference): Value {
  // 1. Assert: IsPropertyReference(V) is true.
  invariant(Environment.IsPropertyReference(realm, V), "expected property reference");

  // 2. If IsSuperReference(V) is true, then
  if (Environment.IsSuperReference(realm, V)) {
    invariant(V.thisValue !== undefined);
    // a. Return the value of the thisValue component of the reference V.
    return V.thisValue;
  }

  // 3. Return GetBase(V).
  let result = Environment.GetBase(realm, V);
  invariant(result instanceof Value);
  return result;
}

// ECMA262 8.3.5
export function GetNewTarget(realm: Realm): UndefinedValue | ObjectValue {
  // 1. Let envRec be GetThisEnvironment( ).
  let envRec = Environment.GetThisEnvironment(realm);

  // 2. Assert: envRec has a [[NewTarget]] field.
  if (!("$NewTarget" in envRec)) {
    // In the spec we should not get here because earlier static checks are supposed to prevent it.
    // However, we do not have an appropriate place to do this check earlier.
    throw realm.createErrorThrowCompletion(realm.intrinsics.SyntaxError, "new.target not allowed here");
  }

  // 3. Return envRec.[[NewTarget]].
  return envRec.$NewTarget || realm.intrinsics.undefined;
}

export function GetTemplateObject(realm: Realm, templateLiteral: BabelNodeTemplateLiteral): ObjectValue {
  // 1. Let rawStrings be TemplateStrings of templateLiteral with argument true.
  let rawStrings = templateLiteral.quasis.map(quasi => quasi.value.raw);

  // 2. Let realm be the current Realm Record.
  realm;

  // 3. Let templateRegistry be realm.[[TemplateMap]].
  let templateRegistry = realm.$TemplateMap;

  // 4. For each element e of templateRegistry, do
  for (let e of templateRegistry) {
    let same;
    if (e.$Strings.length === rawStrings.length) {
      same = true;
      for (let i = 0; i < rawStrings.length; ++i) {
        if (e.$Strings[i] !== rawStrings[i]) {
          same = false;
          break;
        }
      }
    } else {
      same = false;
    }

    // a. If e.[[Strings]] and rawStrings contain the same values in the same order, then
    if (same) {
      // i. Return e.[[Array]].
      return e.$Array;
    }
  }

  // 5. Let cookedStrings be TemplateStrings of templateLiteral with argument false.
  let cookedStrings = templateLiteral.quasis.map(quasi => quasi.value.cooked);

  // 6. Let count be the number of elements in the List cookedStrings.
  let count = cookedStrings.length;

  // 7. Let template be ArrayCreate(count).
  let template = Create.ArrayCreate(realm, count);

  // 8. Let rawObj be ArrayCreate(count).
  let rawObj = Create.ArrayCreate(realm, count);

  // 9. Let index be 0.
  let index = 0;

  // 10. Repeat while index < count
  while (index < count) {
    // a. Let prop be ! ToString(index).
    let prop = To.ToString(realm, new NumberValue(realm, index));

    // b. Let cookedValue be the String value cookedStrings[index].
    let cookedValue = new StringValue(realm, cookedStrings[index]);

    // c. Call template.[[DefineOwnProperty]](prop, PropertyDescriptor{[[Value]]: cookedValue, [[Writable]]: false, [[Enumerable]]: true, [[Configurable]]: false}).
    template.$DefineOwnProperty(prop, {
      value: cookedValue,
      writable: false,
      enumerable: true,
      configurable: false,
    });

    // d. Let rawValue be the String value rawStrings[index].
    let rawValue = new StringValue(realm, rawStrings[index]);

    // e. Call rawObj.[[DefineOwnProperty]](prop, PropertyDescriptor{[[Value]]: rawValue, [[Writable]]: false, [[Enumerable]]: true, [[Configurable]]: false}).
    rawObj.$DefineOwnProperty(prop, {
      value: rawValue,
      writable: false,
      enumerable: true,
      configurable: false,
    });

    // f. Let index be index+1.
    index = index + 1;
  }

  // 11. Perform SetIntegrityLevel(rawObj, "frozen").
  SetIntegrityLevel(realm, rawObj, "frozen");

  // 12. Call template.[[DefineOwnProperty]]("raw", PropertyDescriptor{[[Value]]: rawObj, [[Writable]]: false, [[Enumerable]]: false, [[Configurable]]: false}).
  template.$DefineOwnProperty("raw", {
    value: rawObj,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  // 13. Perform SetIntegrityLevel(template, "frozen").
  SetIntegrityLevel(realm, template, "frozen");

  // 14. Append the Record{[[Strings]]: rawStrings, [[Array]]: template} to templateRegistry.
  templateRegistry.push({ $Strings: rawStrings, $Array: template });

  // 15. Return template.
  return template;
}

export function GetFromArrayWithWidenedNumericProperty(realm: Realm, arr: ArrayValue, P: string | SymbolValue): Value {
  let type = Value;

  if (typeof P === "string") {
    // these are safe methods to allow, as they either return a new array or are a method
    // that doesn't mutate global state or affect that of the values passed in as arguments
    if (P === "map" || P === "slice" || P === "filter" || P === "concat" || P === "indexOf" || P === "reverse") {
      let proto = arr.$GetPrototypeOf();
      invariant(proto instanceof ObjectValue);
      return OrdinaryGet(realm, proto, P, arr);
    }
    if (P === "length") {
      type = NumberValue;
    }
  }
  let prop = typeof P === "string" ? new StringValue(realm, P) : P;
  return AbstractValue.createTemporalFromBuildFunction(realm, type, [arr, prop], ([o, p]) =>
    t.memberExpression(o, p, true)
  );
}
