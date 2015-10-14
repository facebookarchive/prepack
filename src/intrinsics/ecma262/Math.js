/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../../realm.js";
import { StringValue, ObjectValue, NumberValue, AbstractValue } from "../../values/index.js";
import { ToNumber, ToUint32, IsToNumberPure } from "../../methods/index.js";
import { TypesDomain, ValuesDomain } from "../../domains/index.js";
import invariant from "../../invariant.js";
import buildExpressionTemplate from "../../utils/builder.js";

let buildMathRandom = buildExpressionTemplate("Math.random()");
let buildMathImul = buildExpressionTemplate("Math.imul(A, B)");
let buildMathTemplates : Map<string, {f: Function, names: Array<string>}> = new Map();

export default function (realm: Realm): ObjectValue {
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "Math");

  // ECMA262 20.2.1.9
  obj.defineNativeProperty(realm.intrinsics.SymbolToStringTag, new StringValue(realm, "Math"), { writable: false });

  // ECMA262 20.2.1.1
  obj.defineNativeConstant("E", new NumberValue(realm, 2.7182818284590452354));

  // ECMA262 20.2.1.2
  obj.defineNativeConstant("LN10", new NumberValue(realm, 2.302585092994046));

  // ECMA262 20.2.1.3
  obj.defineNativeConstant("LN2", new NumberValue(realm, 0.6931471805599453));

  // ECMA262 20.2.1.4
  obj.defineNativeConstant("LOG10E", new NumberValue(realm, 0.4342944819032518));

  // ECMA262 20.2.1.5
  obj.defineNativeConstant("LOG2E", new NumberValue(realm, 1.4426950408889634));

  // ECMA262 20.2.1.6
  obj.defineNativeConstant("PI", new NumberValue(realm, 3.1415926535897932));

  // ECMA262 20.2.1.7
  obj.defineNativeConstant("SQRT1_2", new NumberValue(realm, 0.7071067811865476));

  // ECMA262 20.2.1.8
  obj.defineNativeConstant("SQRT2", new NumberValue(realm, 1.4142135623730951));

  let functions = [
    // ECMA262 20.2.2.1
    ["abs", 1],

    // ECMA262 20.2.2.2
    ["acos", 1],

    // ECMA262 20.2.2.3
    ["acosh", 1],

    // ECMA262 20.2.2.4
    ["asin", 1],

    // ECMA262 20.2.2.5
    ["asinh", 1],

    // ECMA262 20.2.2.6
    ["atan", 1],

    // ECMA262 20.2.2.7
    ["atanh", 1],

    // ECMA262 20.2.2.8
    ["atan2", 2],

    // ECMA262 20.2.2.9
    ["cbrt", 1],

    // ECMA262 20.2.2.10
    ["ceil", 1],

    // ECMA262 20.2.2.12
    ["cos", 1],

    // ECMA262 20.2.2.13
    ["cosh", 1],

    // ECMA262 20.2.2.14
    ["exp", 1],

    // ECMA262 20.2.2.15
    ["expm1", 1],

    // ECMA262 20.2.2.16
    ["floor", 1],

    // ECMA262 20.2.2.17
    ["fround", 1],

    // ECMA262 20.2.2.18
    ["hypot", 2],

    // ECMA262 20.2.2.20
    ["log", 1],

    // ECMA262 20.2.2.21
    ["log1p", 1],

    // ECMA262 20.2.2.22
    ["log10", 1],

    // ECMA262 20.2.2.23
    ["log2", 1],

    // ECMA262 20.2.2.24 ( _value1_, _value2_, ..._values_ )
    ["max", 2],

    // ECMA262 20.2.2.25
    ["min", 2],

    // ECMA262 20.2.2.26
    ["pow", 2],

    // ECMA262 20.2.2.28
    ["round", 1],

    // ECMA262 20.2.2.30
    ["sin", 1],

    // ECMA262 20.2.2.31
    ["sinh", 1],

    // ECMA262 20.2.2.32
    ["sqrt", 1],

    // ECMA262 20.2.2.33
    ["tan", 1],

    // ECMA262 20.2.2.34
    ["tanh", 1],

    // ECMA262 20.2.2.35
    ["trunc", 1]
  ];

  // ECMA262 20.2.2.11
  if (realm.compatibility !== 'jsc') functions.push(["clz32", 1]);

  // ECMA262 20.2.2.29 (_x_)
  if (realm.compatibility !== 'jsc') functions.push(["sign", 1]);

  for (let [name, length] of functions) {
    obj.defineNativeMethod(name, length, (context, args, originalLength) => {
      args.length = originalLength;
      if (args.some(arg => arg instanceof AbstractValue) && args.every(arg => IsToNumberPure(realm, arg))) {
        let r = buildMathTemplates.get(name);
        if (r === undefined) {
          let names = [...new Array(args.length)].map((_, i) => `X${i}`);
          let f = buildExpressionTemplate(`Math.${name}(${names.join(", ")})`);
          buildMathTemplates.set(name, r = { f, names });
        }

        return realm.createAbstract(new TypesDomain(NumberValue), ValuesDomain.topVal, args, nodes => {
          invariant(r !== undefined);
          let mapping = {};
          for (let i = 0; i < nodes.length; i++) mapping[r.names[i]] = nodes[i];
          return r.f(mapping);
        });
      }

      return new NumberValue(realm, Math[name].apply(null, args.map((arg, i) => ToNumber(realm, arg.throwIfNotConcrete()))));
    });
  }


  // ECMA262 20.2.2.19
  obj.defineNativeMethod("imul", 2, (context, [x, y]) => {
    if ((x instanceof AbstractValue || y instanceof AbstractValue) &&
      IsToNumberPure(realm, x) && IsToNumberPure(realm, y)) {
      return realm.createAbstract(new TypesDomain(NumberValue), ValuesDomain.topVal, [x, y], ([a, b]) => buildMathImul({ A: a, B: b }));
    }

    return new NumberValue(realm, Math.imul(ToUint32(realm, x.throwIfNotConcrete()), ToUint32(realm, y.throwIfNotConcrete())));
  });

  // ECMA262 20.2.2.27
  obj.defineNativeMethod("random", 0, (context) => {
    if (realm.mathRandomGenerator !== undefined) {
      return new NumberValue(realm, realm.mathRandomGenerator());
    } else if (realm.isPartial) {
      return realm.deriveAbstract(new TypesDomain(NumberValue), ValuesDomain.topVal, [], buildMathRandom);
    } else {
      return new NumberValue(realm, Math.random());
    }
  });

  return obj;
}
