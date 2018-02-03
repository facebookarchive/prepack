/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { parseExpression } from "babylon";
import type { Realm } from "../../realm.js";
import { AbstractValue, AbstractObjectValue, NativeFunctionValue, ObjectValue } from "../../values/index.js";
import * as t from "babel-types";
import { createAbstract } from "../prepack/utils.js";
import invariant from "../../invariant";

// Based on www babelHelpers fork.
const babelHelpersCode = `
{
  inherits(subClass, superClass) {
    Object.assign(subClass, superClass);
    subClass.prototype = Object.create(superClass && superClass.prototype);
    subClass.prototype.constructor = subClass;
    subClass.__superConstructor__ = superClass;
    return superClass;
  },
  _extends: Object.assign,
  extends: Object.assign,
  objectWithoutProperties(obj, keys) {
    var target = {};
    for (var i in obj) {
      if (!hasOwn.call(obj, i) || keys.indexOf(i) >= 0) {
        continue;
      }
      target[i] = obj[i];
    }
    return target;
  },
  taggedTemplateLiteralLoose(strings, raw) {
    strings.raw = raw;
    return strings;
  },
  bind: Function.prototype.bind,
}
`;
let babelHelpersAST = parseExpression(babelHelpersCode);

const fbMagicGlobalFunctions = [
  "asset",
  "cx",
  "cssVar",
  "csx",
  "errorDesc",
  "errorHelpCenterID",
  "errorSummary",
  "gkx",
  "glyph",
  "ifRequired",
  "ix",
  "fbglyph",
  "requireWeak",
  "xuiglyph",
];

const fbMagicGlobalObjects = ["JSResource", "Bootloader"];

function createMagicGlobalFunction(realm: Realm, global: ObjectValue | AbstractObjectValue, functionName: string) {
  global.$DefineOwnProperty(functionName, {
    value: new NativeFunctionValue(realm, functionName, functionName, 0, (context, args) => {
      let functionValue = createAbstract(realm, "function");
      functionValue.args = args;
      // build the magic global function up manually from the arguments we pass it
      // i.e. cx(...arg)
      functionValue._buildNode = _args => t.callExpression(t.identifier(functionName), ((_args: any): Array<any>));
      return functionValue;
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

function createMagicGlobalObject(realm: Realm, global: ObjectValue | AbstractObjectValue, objectName: string) {
  let globalObject = AbstractValue.createAbstractObject(realm, objectName);
  globalObject.kind = "resolved";

  global.$DefineOwnProperty(objectName, {
    value: globalObject,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

export function createFbMocks(realm: Realm, global: ObjectValue | AbstractObjectValue) {
  global.$DefineOwnProperty("__DEV__", {
    // TODO: we'll likely want to make this configurable from the outside.
    value: realm.intrinsics.false,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  const babelHelpersValue = realm.$GlobalEnv.evaluate(babelHelpersAST, false);
  invariant(babelHelpersValue instanceof ObjectValue);
  global.$DefineOwnProperty("babelHelpers", {
    value: babelHelpersValue,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  for (let functionName of fbMagicGlobalFunctions) {
    createMagicGlobalFunction(realm, global, functionName);
  }

  for (let objectName of fbMagicGlobalObjects) {
    createMagicGlobalObject(realm, global, objectName);
  }
}
