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
import {
  ArrayValue,
  AbstractValue,
  FunctionValue,
  AbstractObjectValue,
  NativeFunctionValue,
  ObjectValue,
  StringValue,
  NumberValue,
} from "../../values/index.js";
import { Create } from "../../singletons.js";
import { Get } from "../../methods/index.js";
import * as t from "babel-types";
import invariant from "../../invariant";
import { Properties } from "../../singletons.js";
import { forEachArrayValue } from "../../react/utils.js";

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

const fbMagicGlobalObjects = ["JSResource", "fbt"];

function createBabelHelpers(realm: Realm, global: ObjectValue | AbstractObjectValue) {
  let babelHelpersValue = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, `babelHelpers`, true);
  let objectAssign = Get(realm, realm.intrinsics.Object, "assign");
  let objectCreate = Get(realm, realm.intrinsics.Object, "create");

  //babelHelpers.objectWithoutProperties
  let inheritsValue = new NativeFunctionValue(realm, undefined, `inherits`, 2, (context, [subClass, superClass]) => {
    invariant(objectAssign instanceof NativeFunctionValue);
    let objectAssignCall = objectAssign.$Call;
    invariant(objectAssignCall !== undefined);
    objectAssignCall(realm.intrinsics.undefined, [subClass, superClass]);

    invariant(superClass instanceof ObjectValue);
    let superClassPrototype = Get(realm, superClass, "prototype");
    invariant(objectCreate instanceof NativeFunctionValue);
    let objectCreateCall = objectCreate.$Call;
    invariant(typeof objectCreateCall === "function");
    let newPrototype = objectCreateCall(realm.intrinsics.undefined, [superClassPrototype]);

    invariant(subClass instanceof ObjectValue);
    invariant(newPrototype instanceof ObjectValue);
    Properties.Set(realm, subClass, "prototype", newPrototype, true);
    Properties.Set(realm, newPrototype, "constructor", subClass, true);
    Properties.Set(realm, subClass, "__superConstructor__", superClass, true);

    return superClass;
  });
  babelHelpersValue.$DefineOwnProperty("inherits", {
    value: inheritsValue,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  inheritsValue.intrinsicName = `babelHelpers.inherits`;

  //babelHelpers.objectWithoutProperties
  let objectWithoutPropertiesValue = new NativeFunctionValue(
    realm,
    undefined,
    `objectWithoutProperties`,
    2,
    (context, [obj, keys]) => {
      invariant(obj instanceof ObjectValue || obj instanceof AbstractObjectValue || obj instanceof AbstractValue);
      invariant(keys instanceof ArrayValue);
      if (obj.isPartialObject() || obj instanceof AbstractObjectValue || obj instanceof AbstractValue) {
        let value = AbstractValue.createTemporalFromBuildFunction(
          realm,
          ObjectValue,
          [objectWithoutPropertiesValue, obj, keys],
          ([methodNode, objNode, propRemoveNode]) => {
            return t.callExpression(methodNode, [objNode, propRemoveNode]);
          },
          { skipInvariant: true, isPure: true }
        );
        if (value instanceof AbstractObjectValue) {
          // as we are returning an abstract object, we mark it as simple
          value.makeSimple();
        }
        return value;
      } else {
        let removeKeys = new Set();
        forEachArrayValue(realm, keys, key => {
          if (key instanceof StringValue || key instanceof NumberValue) {
            removeKeys.add(key.value);
          }
        });
        let newObject = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
        for (let [propName, binding] of obj.properties) {
          if (!removeKeys.has(propName)) {
            if (binding && binding.descriptor && binding.descriptor.enumerable) {
              let value = Get(realm, obj, propName);
              Properties.Set(realm, newObject, propName, value, true);
            }
          }
        }
        return newObject;
      }
    }
  );
  babelHelpersValue.$DefineOwnProperty("objectWithoutProperties", {
    value: objectWithoutPropertiesValue,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  objectWithoutPropertiesValue.intrinsicName = `babelHelpers.objectWithoutProperties`;

  //babelHelpers.taggedTemplateLiteralLoose
  let taggedTemplateLiteralLooseValue = new NativeFunctionValue(
    realm,
    undefined,
    `taggedTemplateLiteralLoose`,
    2,
    (context, [strings, raw]) => {
      invariant(strings instanceof ObjectValue);
      Properties.Set(realm, strings, "raw", raw, true);
      return strings;
    }
  );
  babelHelpersValue.$DefineOwnProperty("taggedTemplateLiteralLoose", {
    value: taggedTemplateLiteralLooseValue,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  taggedTemplateLiteralLooseValue.intrinsicName = `babelHelpers.taggedTemplateLiteralLoose`;

  //babelHelpers.extends & babelHelpers._extends
  babelHelpersValue.$DefineOwnProperty("extends", {
    value: objectAssign,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  babelHelpersValue.$DefineOwnProperty("_extends", {
    value: objectAssign,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  //babelHelpers.bind
  let functionBind = Get(realm, realm.intrinsics.FunctionPrototype, "bind");

  babelHelpersValue.$DefineOwnProperty("bind", {
    value: functionBind,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  global.$DefineOwnProperty("babelHelpers", {
    value: babelHelpersValue,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  babelHelpersValue.refuseSerialization = false;
}

function createMagicGlobalFunction(realm: Realm, global: ObjectValue | AbstractObjectValue, functionName: string) {
  global.$DefineOwnProperty(functionName, {
    value: new NativeFunctionValue(realm, functionName, functionName, 0, (context, args) => {
      let val = AbstractValue.createTemporalFromBuildFunction(
        realm,
        FunctionValue,
        args,
        _args => t.callExpression(t.identifier(functionName), ((_args: any): Array<any>)),
        { skipInvariant: true, isPure: true }
      );
      invariant(val instanceof AbstractValue);
      return val;
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

function createBootloader(realm: Realm, global: ObjectValue | AbstractObjectValue) {
  let bootloader = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);

  let loadModules = new NativeFunctionValue(realm, "loadModules", "loadModules", 1, (context, args) => {
    invariant(context.$Realm.generator);
    let val = AbstractValue.createTemporalFromBuildFunction(
      realm,
      FunctionValue,
      args,
      _args =>
        t.callExpression(
          t.memberExpression(t.identifier("Bootloader"), t.identifier("loadModules")),
          ((_args: any): Array<any>)
        ),
      { skipInvariant: true, isPure: true }
    );
    invariant(val instanceof AbstractValue);
    return val;
  });

  Properties.Set(realm, bootloader, "loadModules", loadModules, false);

  global.$DefineOwnProperty("Bootloader", {
    value: bootloader,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  return AbstractValue.createAbstractObject(realm, "Bootloader", bootloader);
}

export function createFbMocks(realm: Realm, global: ObjectValue | AbstractObjectValue) {
  global.$DefineOwnProperty("__DEV__", {
    // TODO: we'll likely want to make this configurable from the outside.
    value: realm.intrinsics.false,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  createBabelHelpers(realm, global);

  for (let functionName of fbMagicGlobalFunctions) {
    createMagicGlobalFunction(realm, global, functionName);
  }

  for (let objectName of fbMagicGlobalObjects) {
    createMagicGlobalObject(realm, global, objectName);
  }
  createBootloader(realm, global);
}
