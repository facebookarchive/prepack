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
import { To } from "../../singletons.js";
import invariant from "../../invariant.js";
import { CompilerDiagnostic } from "../../errors.js";
import { Placeholders } from "../../utils/PreludeGenerator.js";

let buildMathTemplates: Map<string, string> = new Map();

export default function(realm: Realm): ObjectValue {
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
    ["trunc", 1],
  ];

  // ECMA262 20.2.2.11
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    functions.push(["clz32", 1]);

  // ECMA262 20.2.2.29 (_x_)
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    functions.push(["sign", 1]);

  for (let [name, length] of functions) {
    obj.defineNativeMethod(name, length, (context, args, originalLength) => {
      invariant(originalLength >= 0);
      args.length = originalLength;
      if (
        originalLength <= 26 &&
        args.some(arg => arg instanceof AbstractValue) &&
        args.every(arg => To.IsToNumberPure(realm, arg))
      ) {
        let templateSource = buildMathTemplates.get(name);
        if (templateSource === undefined) {
          let params = Placeholders.slice(0, originalLength).join(",");
          templateSource = `global.Math.${name}(${params})`;
          buildMathTemplates.set(name, templateSource);
        }
        return AbstractValue.createFromTemplate(realm, templateSource, NumberValue, args);
      }

      return new NumberValue(
        realm,
        Math[name].apply(null, args.map((arg, i) => To.ToNumber(realm, arg.throwIfNotConcrete())))
      );
    });
  }

  const imulTemplateSrc = "global.Math.imul(A, B)";

  // ECMA262 20.2.2.19
  obj.defineNativeMethod("imul", 2, (context, [x, y]) => {
    if (
      (x instanceof AbstractValue || y instanceof AbstractValue) &&
      To.IsToNumberPure(realm, x) &&
      To.IsToNumberPure(realm, y)
    ) {
      return AbstractValue.createFromTemplate(realm, imulTemplateSrc, NumberValue, [x, y]);
    }

    return new NumberValue(
      realm,
      Math.imul(To.ToUint32(realm, x.throwIfNotConcrete()), To.ToUint32(realm, y.throwIfNotConcrete()))
    );
  });

  const mathRandomTemplateSrc = "global.Math.random()";

  // ECMA262 20.2.2.27
  obj.defineNativeMethod("random", 0, context => {
    let mathRandomGenerator = realm.mathRandomGenerator;
    if (mathRandomGenerator !== undefined) {
      let loc = realm.currentLocation;
      let error = new CompilerDiagnostic(
        "Result of Math.random() is made deterministic via a fixed mathRandomSeed",
        loc,
        "PP8000",
        "Information"
      );
      realm.handleError(error);

      return new NumberValue(realm, mathRandomGenerator());
    } else if (realm.useAbstractInterpretation) {
      return AbstractValue.createTemporalFromTemplate(realm, mathRandomTemplateSrc, NumberValue, [], {
        isPure: true,
        skipInvariant: true,
      });
    } else {
      return new NumberValue(realm, Math.random());
    }
  });

  return obj;
}
