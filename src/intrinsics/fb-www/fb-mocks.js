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
import { ValuesDomain } from "../../domains/index.js";
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
import invariant from "../../invariant.js";
import { Properties } from "../../singletons.js";
import { forEachArrayValue } from "../../react/utils.js";
import { createOperationDescriptor } from "../../utils/generator.js";
import { PropertyDescriptor } from "../../descriptors.js";

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
  babelHelpersValue.defineNativeProperty("inherits", inheritsValue, {
    writable: false,
    enumerable: false,
    configurable: true,
  });
  inheritsValue.intrinsicName = `babelHelpers.inherits`;

  const createObjectWithoutProperties = (obj: ObjectValue, keys: ArrayValue) => {
    let removeKeys = new Set();
    forEachArrayValue(realm, keys, key => {
      if (key instanceof StringValue || key instanceof NumberValue) {
        removeKeys.add(key.value);
      }
    });
    let newObject = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
    for (let [propName, binding] of obj.properties) {
      if (!removeKeys.has(propName)) {
        if (binding && binding.descriptor && binding.descriptor.throwIfNotConcrete(realm).enumerable) {
          let value = Get(realm, obj, propName);
          Properties.Set(realm, newObject, propName, value, true);
        }
      }
    }
    return newObject;
  };

  //babelHelpers.objectWithoutProperties
  let objectWithoutPropertiesValue = new NativeFunctionValue(
    realm,
    undefined,
    `objectWithoutProperties`,
    2,
    (context, [obj, keys]) => {
      invariant(obj instanceof ObjectValue || obj instanceof AbstractObjectValue || obj instanceof AbstractValue);
      invariant(keys instanceof ArrayValue);
      if (obj.mightBeObject() && ((obj instanceof AbstractValue && obj.values.isTop()) || obj.isPartialObject())) {
        let temporalArgs = [objectWithoutPropertiesValue, obj, keys];
        let temporalConfig = { skipInvariant: true, isPure: true };
        let value = AbstractValue.createTemporalFromBuildFunction(
          realm,
          ObjectValue,
          temporalArgs,
          createOperationDescriptor("BABEL_HELPERS_OBJECT_WITHOUT_PROPERTIES"),
          temporalConfig
        );
        invariant(value instanceof AbstractObjectValue);
        if (obj instanceof ObjectValue) {
          let template = createObjectWithoutProperties(obj, keys);
          value.values = new ValuesDomain(template);
        }
        // as we are returning an abstract object, we mark it as simple
        value.makeSimple();
        return value;
      } else {
        invariant(obj instanceof ObjectValue);
        return createObjectWithoutProperties(obj, keys);
      }
    }
  );
  babelHelpersValue.defineNativeProperty("objectWithoutProperties", objectWithoutPropertiesValue, {
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
  babelHelpersValue.defineNativeProperty("taggedTemplateLiteralLoose", taggedTemplateLiteralLooseValue, {
    writable: false,
    enumerable: false,
    configurable: true,
  });
  taggedTemplateLiteralLooseValue.intrinsicName = `babelHelpers.taggedTemplateLiteralLoose`;

  //babelHelpers.extends & babelHelpers._extends
  babelHelpersValue.defineNativeProperty("extends", objectAssign, {
    writable: true,
    enumerable: true,
    configurable: true,
  });

  babelHelpersValue.defineNativeProperty("_extends", objectAssign, {
    writable: true,
    enumerable: true,
    configurable: true,
  });

  //babelHelpers.bind
  let functionBind = Get(realm, realm.intrinsics.FunctionPrototype, "bind");

  babelHelpersValue.defineNativeProperty("bind", functionBind, {
    writable: true,
    enumerable: true,
    configurable: true,
  });

  global.$DefineOwnProperty(
    "babelHelpers",
    new PropertyDescriptor({
      value: babelHelpersValue,
      writable: true,
      enumerable: true,
      configurable: true,
    })
  );
  babelHelpersValue.refuseSerialization = false;
}

function createMagicGlobalFunction(realm: Realm, global: ObjectValue | AbstractObjectValue, functionName: string) {
  global.$DefineOwnProperty(
    functionName,
    new PropertyDescriptor({
      value: new NativeFunctionValue(realm, functionName, functionName, 0, (context, args) => {
        let val = AbstractValue.createTemporalFromBuildFunction(
          realm,
          FunctionValue,
          [new StringValue(realm, functionName), ...args],
          createOperationDescriptor("FB_MOCKS_MAGIC_GLOBAL_FUNCTION"),
          { skipInvariant: true, isPure: true }
        );
        invariant(val instanceof AbstractValue);
        return val;
      }),
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );
}

function createMagicGlobalObject(realm: Realm, global: ObjectValue | AbstractObjectValue, objectName: string) {
  let globalObject = AbstractValue.createAbstractObject(realm, objectName);
  globalObject.kind = "resolved";

  global.$DefineOwnProperty(
    objectName,
    new PropertyDescriptor({
      value: globalObject,
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );
}

function createBootloader(realm: Realm, global: ObjectValue | AbstractObjectValue) {
  let bootloader = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);

  let loadModules = new NativeFunctionValue(realm, "loadModules", "loadModules", 1, (context, args) => {
    invariant(context.$Realm.generator);
    let val = AbstractValue.createTemporalFromBuildFunction(
      realm,
      FunctionValue,
      args,
      createOperationDescriptor("FB_MOCKS_BOOTLOADER_LOAD_MODULES"),
      { skipInvariant: true }
    );
    invariant(val instanceof AbstractValue);
    return val;
  });

  Properties.Set(realm, bootloader, "loadModules", loadModules, false);

  global.$DefineOwnProperty(
    "Bootloader",
    new PropertyDescriptor({
      value: bootloader,
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  return AbstractValue.createAbstractObject(realm, "Bootloader", bootloader);
}

export function createFbMocks(realm: Realm, global: ObjectValue | AbstractObjectValue): void {
  global.$DefineOwnProperty(
    "__DEV__",
    new PropertyDescriptor({
      // TODO: we'll likely want to make this configurable from the outside.
      value: realm.intrinsics.false,
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  createBabelHelpers(realm, global);

  for (let functionName of fbMagicGlobalFunctions) {
    createMagicGlobalFunction(realm, global, functionName);
  }

  for (let objectName of fbMagicGlobalObjects) {
    createMagicGlobalObject(realm, global, objectName);
  }
  createBootloader(realm, global);
}
