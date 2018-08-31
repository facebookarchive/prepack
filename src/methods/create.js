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
import type { EnvironmentRecord } from "../environment.js";
import type { PropertyKeyValue, IterationKind } from "../types.js";
import {
  AbstractObjectValue,
  ArrayValue,
  ArgumentsExotic,
  BooleanValue,
  FunctionValue,
  NativeFunctionValue,
  NullValue,
  NumberValue,
  ObjectValue,
  StringExotic,
  StringValue,
  UndefinedValue,
  Value,
} from "../values/index.js";
import { GetPrototypeFromConstructor } from "./get.js";
import { IsConstructor, IsPropertyKey, IsArray } from "./is.js";
import { Type, SameValue, RequireObjectCoercible } from "./abstract.js";
import { Get, GetFunctionRealm } from "./get.js";
import { Construct, MakeConstructor } from "./construct.js";
import { Functions, Properties, To } from "../singletons.js";
import IsStrict from "../utils/strict.js";
import invariant from "../invariant.js";
import parse from "../utils/parse.js";
import traverseFast from "../utils/traverse-fast.js";
import type { BabelNodeIdentifier, BabelNodeLVal, BabelNodeFunctionDeclaration } from "@babel/types";
import { PropertyDescriptor } from "../descriptors.js";

const allElementTypes = ["Undefined", "Null", "Boolean", "String", "Symbol", "Number", "Object"];

export class CreateImplementation {
  // ECMA262 9.4.3.3
  StringCreate(realm: Realm, value: StringValue, prototype: ObjectValue | AbstractObjectValue): ObjectValue {
    // 1. Assert: Type(value) is String.
    invariant(value instanceof StringValue, "expected string value");

    // 2. Let S be a newly created String exotic object.
    let S = new StringExotic(realm);

    // 3. Set the [[StringData]] internal slot of S to value.
    S.$StringData = value;

    // 4. Set S's essential internal methods to the default ordinary object definitions specified in 9.1.

    // 5. Set the [[GetOwnProperty]] internal method of S as specified in 9.4.3.1.

    // 6. Set the [[OwnPropertyKeys]] internal method of S as specified in 9.4.3.2.

    // 7. Set the [[Prototype]] internal slot of S to prototype.
    S.$Prototype = prototype;

    // 8. Set the [[Extensible]] internal slot of S to true.
    S.setExtensible(true);

    // 9. Let length be the number of code unit elements in value.
    let length = value.value.length;

    // 10. Perform ! DefinePropertyOrThrow(S, "length", PropertyDescriptor{[[Value]]: length, [[Writable]]: false, [[Enumerable]]: false, [[Configurable]]: false }).
    Properties.DefinePropertyOrThrow(
      realm,
      S,
      "length",
      new PropertyDescriptor({
        value: new NumberValue(realm, length),
        writable: false,
        enumerable: false,
        configurable: false,
      })
    );

    // 11. Return S.
    return S;
  }

  // B.2.3.2.1
  CreateHTML(realm: Realm, string: Value, tag: string, attribute: string, value: string | Value): StringValue {
    // 1. Let str be ? RequireObjectCoercible(string).
    let str = RequireObjectCoercible(realm, string);

    // 2. Let S be ? ToString(str).
    let S = To.ToStringPartial(realm, str);

    // 3. Let p1 be the String value that is the concatenation of "<" and tag.
    let p1 = `<${tag}`;

    // 4. If attribute is not the empty String, then
    if (attribute) {
      // a. Let V be ? ToString(value).
      let V = To.ToStringPartial(realm, value);

      // b. Let escapedV be the String value that is the same as V except that each occurrence of the code unit
      //    0x0022 (QUOTATION MARK) in V has been replaced with the six code unit sequence "&quot;".
      let escapedV = V.replace(/"/g, "&quot;");

      // c. Let p1 be the String value that is the concatenation of the following String values:
      // - The String value of p1
      // - Code unit 0x0020 (SPACE)
      // - The String value of attribute
      // - Code unit 0x003D (EQUALS SIGN)
      // - Code unit 0x0022 (QUOTATION MARK)
      // - The String value of escapedV
      // - Code unit 0x0022 (QUOTATION MARK)
      p1 = `${p1} ${attribute}="${escapedV}"`;
    }

    // 5. Let p2 be the String value that is the concatenation of p1 and ">".
    let p2 = `${p1}>`;

    // 6. Let p3 be the String value that is the concatenation of p2 and S.
    let p3 = `${p2}${S}`;

    // 7. Let p4 be the String value that is the concatenation of p3, "</", tag, and ">".
    let p4 = `${p3}</${tag}>`;

    // 8. Return p4.
    return new StringValue(realm, p4);
  }

  // ECMA262 9.4.4.8.1
  MakeArgGetter(realm: Realm, name: string, env: EnvironmentRecord): NativeFunctionValue {
    return new NativeFunctionValue(
      realm,
      undefined,
      undefined,
      0,
      context => {
        return env.GetBindingValue(name, false);
      },
      false
    );
  }

  // ECMA262 9.4.4.8.1
  MakeArgSetter(realm: Realm, name: string, env: EnvironmentRecord): NativeFunctionValue {
    return new NativeFunctionValue(
      realm,
      undefined,
      undefined,
      1,
      (context, [value]) => {
        return env.SetMutableBinding(name, value, false);
      },
      false
    );
  }

  // ECMA262 21.1.5.1
  CreateStringIterator(realm: Realm, string: StringValue): ObjectValue {
    // 1. Assert: Type(string) is String.
    invariant(string instanceof StringValue, "expected string to be a string value");

    // 2. Let iterator be ObjectCreate(%StringIteratorPrototype%, « [[IteratedString]], [[StringIteratorNextIndex]] »).
    let iterator = this.ObjectCreate(realm, realm.intrinsics.StringIteratorPrototype, {
      $IteratedString: undefined,
      $StringIteratorNextIndex: undefined,
    });

    // 3. Set iterator's [[IteratedString]] internal slot to string.
    iterator.$IteratedString = string;

    // 4. Set iterator's [[StringIteratorNextIndex]] internal slot to 0.
    iterator.$StringIteratorNextIndex = 0;

    // 5. Return iterator.
    return iterator;
  }

  // ECMA262 9.4.2.3
  ArraySpeciesCreate(realm: Realm, originalArray: ObjectValue, length: number): ObjectValue {
    // 1. Assert: length is an integer Number ≥ 0.
    invariant(length >= 0, "expected length >= 0");

    // 2. If length is -0, let length be +0.
    if (Object.is(length, -0)) length = +0;

    // 3. Let C be undefined.
    let C = realm.intrinsics.undefined;

    // 4. Let isArray be ? IsArray(originalArray).
    let isArray = IsArray(realm, originalArray);

    // 5. If isArray is true, then
    if (isArray) {
      // a. Let C be ? Get(originalArray, "constructor").
      C = Get(realm, originalArray, "constructor");

      // b. If IsConstructor(C) is true, then
      if (IsConstructor(realm, C)) {
        invariant(C instanceof ObjectValue);
        // i. Let thisRealm be the current Realm Record.
        let thisRealm = realm;

        // ii. Let realmC be ? GetFunctionRealm(C).
        let realmC = GetFunctionRealm(realm, C);

        // iii. If thisRealm and realmC are not the same Realm Record, then
        if (thisRealm !== realmC) {
          // 1. If SameValue(C, realmC.[[Intrinsics]].[[%Array%]]) is true, let C be undefined.
          if (SameValue(realm, C, realmC.intrinsics.Array)) {
            C = realm.intrinsics.undefined;
          }
        }
      }

      // c. If Type(C) is Object, then
      if (C.mightBeObject()) {
        if (C.mightNotBeObject()) C.throwIfNotConcrete();
        invariant(C instanceof ObjectValue || C instanceof AbstractObjectValue);
        // i. Let C be ? Get(C, @@species).
        C = Get(realm, C, realm.intrinsics.SymbolSpecies);

        // ii. If C is null, let C be undefined.
        if (C instanceof NullValue) C = realm.intrinsics.undefined;
      }
    }

    // 6. If C is undefined, return ? ArrayCreate(length).
    if (C instanceof UndefinedValue) return this.ArrayCreate(realm, length);

    // 7. If IsConstructor(C) is false, throw a TypeError exception.
    if (!IsConstructor(realm, C)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not a constructor");
    }

    // 8. Return ? Construct(C, « length »).
    return Construct(realm, C.throwIfNotConcreteObject(), [new NumberValue(realm, length)]).throwIfNotConcreteObject();
  }

  // ECMA262 7.4.7
  CreateIterResultObject(realm: Realm, value: Value, done: boolean): ObjectValue {
    // 1. Assert: Type(done) is Boolean.
    invariant(typeof done === "boolean", "expected done to be a boolean");

    // 2. Let obj be ObjectCreate(%ObjectPrototype%).
    let obj = this.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

    // 3. Perform CreateDataProperty(obj, "value", value).
    this.CreateDataProperty(realm, obj, "value", value);

    // 4. Perform CreateDataProperty(obj, "done", done).
    this.CreateDataProperty(realm, obj, "done", new BooleanValue(realm, done));

    // 5. Return obj.
    return obj;
  }

  // ECMA262 22.1.5.1
  CreateArrayIterator(realm: Realm, array: ObjectValue, kind: IterationKind): ObjectValue {
    // 1. Assert: Type(array) is Object.
    invariant(array instanceof ObjectValue, "expected object");

    // 2. Let iterator be ObjectCreate(%ArrayIteratorPrototype%, « [[IteratedObject]],
    //    [[ArrayIteratorNextIndex]], [[ArrayIterationKind]] »).
    let iterator = this.ObjectCreate(realm, realm.intrinsics.ArrayIteratorPrototype, {
      $IteratedObject: undefined,
      $ArrayIteratorNextIndex: undefined,
      $ArrayIterationKind: undefined,
    });

    // 3. Set iterator's [[IteratedObject]] internal slot to array.
    iterator.$IteratedObject = array;

    // 4. Set iterator's [[ArrayIteratorNextIndex]] internal slot to 0.
    iterator.$ArrayIteratorNextIndex = new NumberValue(realm, 0);

    // 5. Set iterator's [[ArrayIterationKind]] internal slot to kind.
    iterator.$ArrayIterationKind = kind;

    // 6. Return iterator.
    return iterator;
  }

  // ECMA262 9.4.2.2
  ArrayCreate(realm: Realm, length: number, proto?: ObjectValue | AbstractObjectValue): ArrayValue {
    // 1. Assert: length is an integer Number ≥ 0.
    invariant(length >= 0);

    // 2. If length is -0, let length be +0.
    if (Object.is(length, -0)) length = +0;

    // 3. If length>232-1, throw a RangeError exception.
    if (length > Math.pow(2, 32) - 1) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError, "length>2^32-1");
    }

    // 4. If the proto argument was not passed, let proto be the intrinsic object %ArrayPrototype%.
    proto = proto || realm.intrinsics.ArrayPrototype;

    // 5. Let A be a newly created Array exotic object.
    let A = new ArrayValue(realm);

    // 6. Set A's essential internal methods except for [[DefineOwnProperty]] to the default ordinary object definitions specified in 9.1.
    // 7. Set the [[DefineOwnProperty]] internal method of A as specified in 9.4.2.1.

    // 8. Set the [[Prototype]] internal slot of A to proto.
    A.$Prototype = proto;

    // 9. Set the [[Extensible]] internal slot of A to true.
    A.setExtensible(true);

    // 10. Perform ! OrdinaryDefineOwnProperty(A, "length", PropertyDescriptor{[[Value]]: length, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: false}).
    Properties.OrdinaryDefineOwnProperty(
      realm,
      A,
      "length",
      new PropertyDescriptor({
        value: new NumberValue(realm, length),
        writable: true,
        enumerable: false,
        configurable: false,
      })
    );

    // 11. Return A.
    return A;
  }

  // ECMA262 7.3.16
  CreateArrayFromList(realm: Realm, elems: Array<Value>): ArrayValue {
    // 1. Assert: elements is a List whose elements are all ECMAScript language values.
    for (let elem of elems) invariant(elem instanceof Value, "value expected");

    // 2. Let array be ArrayCreate(0) (see 9.4.2.2).
    let arr = this.ArrayCreate(realm, 0);

    // 3. Let n be 0.
    let n = 0;

    // 4. For each element e of elements
    for (let elem of elems) {
      // a. Let status be CreateDataProperty(array, ! ToString(n), e).
      let status = this.CreateDataProperty(realm, arr, new StringValue(realm, n + ""), elem);

      // b. Assert: status is true.
      invariant(status, "couldn't create data property");

      // c. Increment n by 1.
      n++;
    }

    // 5. Return array.
    return arr;
  }

  // ECMA262 9.4.4.7
  CreateUnmappedArgumentsObject(realm: Realm, argumentsList: Array<Value>): ObjectValue {
    // 1. Let len be the number of elements in argumentsList.
    let len = argumentsList.length;

    // 2. Let obj be ObjectCreate(%ObjectPrototype%, « [[ParameterMap]] »).
    let obj = this.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

    // 3. Set obj's [[ParameterMap]] internal slot to undefined.
    obj.$ParameterMap = obj; // The value is never used, but allows us to use undefined for "not in"

    // 4. Perform DefinePropertyOrThrow(obj, "length", PropertyDescriptor{[[Value]]: len,
    //    [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true}).
    Properties.DefinePropertyOrThrow(
      realm,
      obj,
      "length",
      new PropertyDescriptor({
        value: new NumberValue(realm, len),
        writable: true,
        enumerable: false,
        configurable: true,
      })
    );

    // 5. Let index be 0.
    let index = 0;

    // 6. Repeat while index < len,
    while (index < len) {
      // a. Let val be argumentsList[index].
      let val = argumentsList[index];

      // b. Perform CreateDataProperty(obj, ! ToString(index), val).
      this.CreateDataProperty(realm, obj, new StringValue(realm, index + ""), val);

      // c. Let index be index + 1.
      index++;
    }

    // 7. Perform ! DefinePropertyOrThrow(obj, @@iterator, PropertyDescriptor {[[Value]]:
    //    %ArrayProto_values%, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true}).
    Properties.DefinePropertyOrThrow(
      realm,
      obj,
      realm.intrinsics.SymbolIterator,
      new PropertyDescriptor({
        value: realm.intrinsics.ArrayProto_values,
        writable: true,
        enumerable: false,
        configurable: true,
      })
    );

    // 8. Perform ! DefinePropertyOrThrow(obj, "callee", PropertyDescriptor {[[Get]]:
    // %ThrowTypeError%, [[Set]]: %ThrowTypeError%, [[Enumerable]]: false, [[Configurable]]: false}).
    Properties.DefinePropertyOrThrow(
      realm,
      obj,
      "callee",
      new PropertyDescriptor({
        get: realm.intrinsics.ThrowTypeError,
        set: realm.intrinsics.ThrowTypeError,
        enumerable: false,
        configurable: false,
      })
    );

    // 10. Return obj.
    return obj;
  }

  // ECMA262 9.4.4.8
  CreateMappedArgumentsObject(
    realm: Realm,
    func: FunctionValue,
    formals: Array<BabelNodeLVal>,
    argumentsList: Array<Value>,
    env: EnvironmentRecord
  ): ObjectValue {
    // 1. Assert: formals does not contain a rest parameter, any binding patterns, or any
    //    initializers. It may contain duplicate identifiers.
    for (let param of formals) {
      invariant(param.type === "Identifier", "expected only simple params");
    }

    // 2. Let len be the number of elements in argumentsList.
    let len = argumentsList.length;

    // 3. Let obj be a newly created arguments exotic object with a [[ParameterMap]] internal slot.
    let obj = new ArgumentsExotic(realm);

    // 4. Set the [[GetOwnProperty]] internal method of obj as specified in 9.4.4.1.

    // 5. Set the [[DefineOwnProperty]] internal method of obj as specified in 9.4.4.2.

    // 6. Set the [[Get]] internal method of obj as specified in 9.4.4.3.

    // 7. Set the [[Set]] internal method of obj as specified in 9.4.4.4.

    // 8. Set the [[Delete]] internal method of obj as specified in 9.4.4.6.

    // 9. Set the remainder of obj's essential internal methods to the default ordinary
    //    object definitions specified in 9.1.

    // 10. Set the [[Prototype]] internal slot of obj to %ObjectPrototype%.
    obj.$Prototype = realm.intrinsics.ObjectPrototype;

    // 11. Set the [[Extensible]] internal slot of obj to true.
    obj.setExtensible(true);

    // 12. Let map be ObjectCreate(null).
    let map: ObjectValue = new ObjectValue(realm);

    // 13. Set the [[ParameterMap]] internal slot of obj to map.
    obj.$ParameterMap = map;

    // 14. Let parameterNames be the BoundNames of formals.
    let parameterNames = [];
    for (let param of formals) {
      parameterNames.push(((param: any): BabelNodeIdentifier).name);
    }

    // 15. Let numberOfParameters be the number of elements in parameterNames.
    let numberOfParameters = parameterNames.length;

    // 16. Let index be 0.
    let index = 0;

    // 17. Repeat while index < len,
    while (index < len) {
      // a. Let val be argumentsList[index].
      let val = argumentsList[index];

      // b. Perform CreateDataProperty(obj, ! ToString(index), val).
      this.CreateDataProperty(realm, obj, new StringValue(realm, index + ""), val);

      // c. Let index be index + 1.
      index++;
    }

    // 18. Perform DefinePropertyOrThrow(obj, "length", PropertyDescriptor{[[Value]]: len,
    //     [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true}).
    Properties.DefinePropertyOrThrow(
      realm,
      obj,
      "length",
      new PropertyDescriptor({
        value: new NumberValue(realm, len),
        writable: true,
        enumerable: false,
        configurable: true,
      })
    );

    // 19. Let mappedNames be an empty List.
    let mappedNames = [];

    // 20. Let index be numberOfParameters - 1.
    index = numberOfParameters - 1;

    // 21. Repeat while index ≥ 0,
    while (index >= 0) {
      // a. Let name be parameterNames[index].
      let name = parameterNames[index];

      // b. If name is not an element of mappedNames, then
      if (mappedNames.indexOf(name) < 0) {
        // i. Add name as an element of the list mappedNames.
        mappedNames.push(name);

        // ii. If index < len, then
        if (index < len) {
          // 1. Let g be MakeArgGetter(name, env).
          let g = this.MakeArgGetter(realm, name, env);

          // 2. Let p be MakeArgSetter(name, env).
          let p = this.MakeArgSetter(realm, name, env);

          // 3. Perform map.[[DefineOwnProperty]](! ToString(index), PropertyDescriptor{[[Set]]: p, [[Get]]: g,
          //    [[Enumerable]]: false, [[Configurable]]: true}).
          map.$DefineOwnProperty(
            new StringValue(realm, index + ""),
            new PropertyDescriptor({
              set: p,
              get: g,
              enumerable: false,
              configurable: true,
            })
          );
        }
      }

      // c. Let index be index - 1.
      index--;
    }

    // 22. Perform ! DefinePropertyOrThrow(obj, @@iterator, PropertyDescriptor {[[Value]]:
    //     %ArrayProto_values%, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true}).
    Properties.DefinePropertyOrThrow(
      realm,
      obj,
      realm.intrinsics.SymbolIterator,
      new PropertyDescriptor({
        value: realm.intrinsics.ArrayProto_values,
        writable: true,
        enumerable: false,
        configurable: true,
      })
    );

    // 23. Perform ! DefinePropertyOrThrow(obj, "callee", PropertyDescriptor {[[Value]]:
    //     func, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true}).
    Properties.DefinePropertyOrThrow(
      realm,
      obj,
      "callee",
      new PropertyDescriptor({
        value: func,
        writable: true,
        enumerable: false,
        configurable: true,
      })
    );

    // 24. Return obj.
    return obj;
  }

  // ECMA262 7.3.4
  CreateDataProperty(realm: Realm, O: ObjectValue | AbstractObjectValue, P: PropertyKeyValue, V: Value): boolean {
    // 1. Assert: Type(O) is Object.

    // 2. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(realm, P), "Not a property key");

    // 3. Let newDesc be the PropertyDescriptor{[[Value]]: V, [[Writable]]: true, [[Enumerable]]: true, [[Configurable]]: true}.
    let newDesc = new PropertyDescriptor({
      value: V,
      writable: true,
      enumerable: true,
      configurable: true,
    });

    // 4. Return ? O.[[DefineOwnProperty]](P, newDesc).
    return O.$DefineOwnProperty(P, newDesc);
  }

  CopyDataProperties(realm: Realm, target: ObjectValue, source: Value, excluded: Array<PropertyKeyValue>): ObjectValue {
    // Assert: Type(target) is Object.
    invariant(target instanceof ObjectValue, "Not an object value");

    // Assert: Type(excluded) is List.
    invariant(excluded instanceof Array, "Not an array");

    //   If source is undefined or null,
    if (source === realm.intrinsics.null || source === realm.intrinsics.undefined) {
      // let keys be a new empty List.
    } else {
      //   Else,
      // Let from be ! ToObject(source).
      let from = To.ToObject(realm, source);

      // Let keys be ? from.[[OwnPropertyKeys]]().
      let keys = from.$OwnPropertyKeys();

      //   Repeat for each element nextKey of keys in List order,
      for (let nextKey of keys) {
        // Let found be false.
        let found = false;

        //   Repeat for each element e of excluded,
        for (let e of excluded) {
          // Seems necessary. Flow complained too. Did I go wrong somewhere else?
          invariant(e instanceof StringValue);
          invariant(nextKey instanceof StringValue);

          // If e is not empty and SameValue(e, nextKey) is true, then
          if (!e.mightBeFalse() && SameValue(realm, e, nextKey)) {
            // Set found to true.
            found = true;
          }
        }
        // If found is false, then
        if (found === false) {
          // Let desc be ? from.[[GetOwnProperty]](nextKey).
          let desc = from.$GetOwnProperty(nextKey);

          // If desc is not undefined and desc.[[Enumerable]] is true, then
          if (desc !== undefined && desc.throwIfNotConcrete(realm).enumerable === true) {
            // Let propValue be ? Get(from, nextKey).
            let propValue = Get(realm, from, nextKey);
            // Perform ! CreateDataProperty(target, nextKey, propValue).
            this.CreateDataProperty(realm, target, nextKey, propValue);
          }
        }
      }
    }

    // Return target.
    return target;
  }

  // ECMA262 7.3.5
  CreateMethodProperty(realm: Realm, O: ObjectValue, P: PropertyKeyValue, V: Value): boolean {
    // 1. Assert: Type(O) is Object.
    invariant(O instanceof ObjectValue, "Not an object value");

    // 2. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(realm, P), "Not a property key");

    // 3. Let newDesc be the PropertyDescriptor{[[Value]]: V, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true}.
    let newDesc = new PropertyDescriptor({
      value: V,
      writable: true,
      enumerable: false,
      configurable: true,
    });

    // 4. Return ? O.[[DefineOwnProperty]](P, newDesc).
    return O.$DefineOwnProperty(P, newDesc);
  }

  // ECMA262 7.3.6
  CreateDataPropertyOrThrow(realm: Realm, O: Value, P: PropertyKeyValue, V: Value): boolean {
    // 1. Assert: Type(O) is Object.
    invariant(O instanceof ObjectValue, "Not an object value");

    // 2. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(realm, P), "Not a property key");

    //3. Let success be ? CreateDataProperty(O, P, V).
    let success = this.CreateDataProperty(realm, O, P, V);

    // 4. If success is false, throw a TypeError exception.
    if (success === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not a function");
    }

    // 5. Return success.
    return success;
  }

  // ECMA262 9.1.12
  ObjectCreate(
    realm: Realm,
    proto: ObjectValue | AbstractObjectValue | NullValue,
    internalSlotsList?: { [key: string]: void }
  ): ObjectValue {
    // 1. If internalSlotsList was not provided, let internalSlotsList be an empty List.
    internalSlotsList = internalSlotsList || {};

    // 2. Let obj be a newly created object with an internal slot for each name in internalSlotsList.
    let obj = new ObjectValue(realm);
    Object.assign(obj, internalSlotsList);

    // 3. Set obj's essential internal methods to the default ordinary object definitions specified in 9.1.

    // 4. Set the [[Prototype]] internal slot of obj to proto.
    obj.$Prototype = proto;

    // 5. Set the [[Extensible]] internal slot of obj to true.
    obj.setExtensible(true);

    // 6. Return obj.
    return obj;
  }

  // ECMA262 9.1.13
  OrdinaryCreateFromConstructor(
    realm: Realm,
    constructor: ObjectValue,
    intrinsicDefaultProto: string,
    internalSlotsList?: { [key: string]: void }
  ): ObjectValue {
    // 1. Assert: intrinsicDefaultProto is a String value that is this specification's name of an intrinsic
    //    object. The corresponding object must be an intrinsic that is intended to be used as the [[Prototype]]
    //    value of an object.
    invariant(realm.intrinsics[intrinsicDefaultProto], "not a valid proto ref");

    // 2. Let proto be ? GetPrototypeFromConstructor(constructor, intrinsicDefaultProto).
    let proto = GetPrototypeFromConstructor(realm, constructor, intrinsicDefaultProto);

    // 3. Return ObjectCreate(proto, internalSlotsList).
    return this.ObjectCreate(realm, proto, internalSlotsList);
  }

  // ECMA262 7.3.17
  CreateListFromArrayLike(realm: Realm, obj: Value, elementTypes?: Array<string>): Array<Value> {
    // 1. If elementTypes was not passed, let elementTypes be « Undefined, Null, Boolean, String, Symbol, Number, Object ».
    elementTypes = elementTypes || allElementTypes;

    // 2. If Type(obj) is not Object, throw a TypeError exception.
    if (!(obj instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Not an object");
    }

    // 3. Let len be ? ToLength(? Get(obj, "length")).
    let len = To.ToLength(realm, Get(realm, obj, "length"));

    // 4. Let list be a new empty List.
    let list: Array<Value> = [];

    // 5. Let index be 0.
    let index = 0;

    // 6. Repeat while index < len
    while (index < len) {
      // a. Let indexName be ! ToString(index).
      let indexName = index + "";

      // b. Let next be ? Get(obj, indexName).
      let next = Get(realm, obj, indexName);

      // c. If Type(next) is not an element of elementTypes, throw a TypeError exception.
      if (elementTypes !== allElementTypes && elementTypes.indexOf(Type(realm, next)) < 0) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "invalid element type");
      }

      // d. Append next as the last element of list.
      list.push(next);

      // e. Set index to index + 1.
      index++;
    }

    // 7. Return list.
    return list;
  }

  // ECMA262 19.2.1.1.1
  CreateDynamicFunction(
    realm: Realm,
    constructor: ObjectValue,
    newTarget: void | ObjectValue,
    kind: "normal" | "generator",
    args: Array<Value>
  ): Value {
    // 1. If newTarget is undefined, let newTarget be constructor.
    newTarget = !newTarget ? constructor : newTarget;

    let fallbackProto;
    // 2. If kind is "normal", then
    if (kind === "normal") {
      // a. Let goal be the grammar symbol FunctionBody.

      // b. Let parameterGoal be the grammar symbol FormalParameters.

      // c. Let fallbackProto be "%FunctionPrototype%".
      fallbackProto = "FunctionPrototype";
    } else {
      // 3. Else,
      // a. Let goal be the grammar symbol GeneratorBody.

      // b. Let parameterGoal be the grammar symbol FormalParameters[Yield].

      // c. Let fallbackProto be "%Generator%".
      fallbackProto = "Generator";
    }

    // 4. Let argCount be the number of elements in args.
    let argCount = args.length;

    // 5. Let P be the empty String.
    let P = "";

    let bodyText;
    // 6. If argCount = 0, let bodyText be the empty String.
    if (argCount === 0) {
      bodyText = realm.intrinsics.emptyString;
    } else if (argCount === 1) {
      // 7. Else if argCount = 1, let bodyText be args[0].
      bodyText = args[0];
    } else {
      // 8. Else argCount > 1,
      // a. Let firstArg be args[0].
      let firstArg = args[0];

      // b. Let P be ? ToString(firstArg).
      P = To.ToStringPartial(realm, firstArg);

      // c. Let k be 1.
      let k = 1;

      // d. Repeat, while k < argCount-1
      while (k < argCount - 1) {
        // i. Let nextArg be args[k].
        let nextArg = args[k];

        // ii. Let nextArgString be ? ToString(nextArg).
        let nextArgString = To.ToStringPartial(realm, nextArg);

        // iii. Let P be the result of concatenating the previous value of P, the String "," (a comma), and nextArgString.
        P = P + "," + nextArgString;

        // iv. Increase k by 1.
        k += 1;
      }

      // e. Let bodyText be args[k].
      bodyText = args[k];
    }

    // 9. Let bodyText be ? ToString(bodyText).
    bodyText = To.ToStringPartial(realm, bodyText);

    // 10. Let parameters be the result of parsing P, interpreted as UTF-16 encoded Unicode text as described in 6.1.4, using parameterGoal as the goal symbol. Throw a SyntaxError exception if the parse fails.
    // 11. Let body be the result of parsing bodyText, interpreted as UTF-16 encoded Unicode text as described in 6.1.4, using goal as the goal symbol. Throw a SyntaxError exception if the parse fails.
    let ast;
    try {
      ast = parse(realm, "function" + (kind === "generator" ? "*" : "") + " _(" + P + "){" + bodyText + "}", "eval");
    } catch (e) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.SyntaxError, "parse failed");
    }
    let {
      program: {
        body: [functionDeclaration],
      },
    } = ast;
    if (!functionDeclaration) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.SyntaxError, "parse failed");
    }
    invariant(functionDeclaration.type === "FunctionDeclaration");
    let { params, body } = ((functionDeclaration: any): BabelNodeFunctionDeclaration);

    // 12. If bodyText is strict mode code, then let strict be true, else let strict be false.
    let strict = IsStrict(body);

    // 13. If any static semantics errors are detected for parameters or body, throw a SyntaxError or a ReferenceError exception, depending on the type of the error. If strict is true, the Early Error rules for StrictFormalParameters:FormalParameters are applied. Parsing and early error detection may be interweaved in an implementation dependent manner.

    // 14. If ContainsUseStrict of body is true and IsSimpleParameterList of parameters is false, throw a SyntaxError exception.

    // 15. If any element of the BoundNames of parameters also occurs in the LexicallyDeclaredNames of body, throw a SyntaxError exception.

    // 16. If body Contains SuperCall is true, throw a SyntaxError exception.

    // 17. If parameters Contains SuperCall is true, throw a SyntaxError exception.

    // 18. If body Contains SuperProperty is true, throw a SyntaxError exception.

    // 19. If parameters Contains SuperProperty is true, throw a SyntaxError exception.

    // 20. If kind is "generator", then
    if (kind === "generator") {
      // a. If parameters Contains YieldExpression is true, throw a SyntaxError exception.
      let containsYield = false;
      for (let param of params) {
        traverseFast(param, node => {
          if (node.type === "YieldExpression") {
            containsYield = true;
            return true;
          }
          if (node.type === "Identifier" && ((node: any): BabelNodeIdentifier).name === "yield") {
            containsYield = true;
            return true;
          }
          return false;
        });
      }
      if (containsYield) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.SyntaxError, "parse failed");
      }
    }

    // 21. If strict is true, then
    if (strict === true) {
      // a. If BoundNames of parameters contains any duplicate elements, throw a SyntaxError exception.
    }

    // 22. Let proto be ? GetPrototypeFromConstructor(newTarget, fallbackProto).
    let proto = GetPrototypeFromConstructor(realm, newTarget, fallbackProto);

    // 23. Let F be FunctionAllocate(proto, strict, kind).
    let F = Functions.FunctionAllocate(realm, proto, strict, kind);

    // 24. Let realmF be the value of F's [[Realm]] internal slot.
    let realmF = F.$Realm;

    // 25. Let scope be realmF.[[GlobalEnv]].
    let scope = realmF.$GlobalEnv;

    // 26. Perform FunctionInitialize(F, Normal, parameters, body, scope).
    Functions.FunctionInitialize(realm, F, "normal", params, body, scope);

    // 27. If kind is "generator", then
    if (kind === "generator") {
      // a. Let prototype be ObjectCreate(%GeneratorPrototype%).
      let prototype = this.ObjectCreate(realm, realm.intrinsics.GeneratorPrototype);
      prototype.originalConstructor = F;

      // b. Perform DefinePropertyOrThrow(F, "prototype", PropertyDescriptor{[[Value]]: prototype, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: false}).
      Properties.DefinePropertyOrThrow(
        realm,
        F,
        "prototype",
        new PropertyDescriptor({
          value: prototype,
          writable: true,
          enumerable: false,
          configurable: false,
        })
      );
    } else {
      // 28. Else, perform MakeConstructor(F).
      MakeConstructor(realm, F);
    }

    // 29. Perform SetFunctionName(F, "anonymous").
    Functions.SetFunctionName(realm, F, "anonymous");

    // 30. Return F.
    return F;
  }
}
