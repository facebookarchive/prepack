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
import { AbstractValue, NativeFunctionValue, ObjectValue, StringValue } from "../../values/index.js";
import { createMockReact } from "./react-mocks.js";
import { createMockReactRelay } from "./relay-mocks.js";
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

export default function(realm: Realm): void {
  let global = realm.$GlobalObject;

  global.$DefineOwnProperty("__DEV__", {
    // TODO: we'll likely want to make this configurable from the outside.
    value: realm.intrinsics.false,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  // module.exports support
  let moduleValue = AbstractValue.createAbstractObject(realm, "module");
  moduleValue.kind = "resolved";
  let moduleExportsValue = AbstractValue.createAbstractObject(realm, "module.exports");
  moduleExportsValue.kind = "resolved";

  moduleValue.$DefineOwnProperty("exports", {
    value: moduleExportsValue,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  global.$DefineOwnProperty("module", {
    value: moduleValue,
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

  // apply require() mock
  global.$DefineOwnProperty("require", {
    value: new NativeFunctionValue(realm, "require", "require", 0, (context, [requireNameVal]) => {
      invariant(requireNameVal instanceof StringValue);
      let requireNameValValue = requireNameVal.value;

      if (requireNameValValue === "react" || requireNameValValue === "React") {
        if (realm.fbLibraries.react === undefined) {
          let react = createMockReact(realm, requireNameValValue);
          realm.fbLibraries.react = react;
          return react;
        }
        return realm.fbLibraries.react;
      } else if (requireNameValValue === "react-relay" || requireNameValValue === "RelayModern") {
        if (realm.fbLibraries.reactRelay === undefined) {
          let reactRelay = createMockReactRelay(realm, requireNameValValue);
          realm.fbLibraries.reactRelay = reactRelay;
          return reactRelay;
        }
        return realm.fbLibraries.reactRelay;
      } else {
        let requireVal;

        if (realm.fbLibraries.other.has(requireNameValValue)) {
          requireVal = realm.fbLibraries.other.get(requireNameValValue);
        } else {
          requireVal = createAbstract(realm, "function", `require("${requireNameValValue}")`);
          realm.fbLibraries.other.set(requireNameValValue, requireVal);
        }
        invariant(requireVal instanceof AbstractValue);
        return requireVal;
      }
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  global.$DefineOwnProperty("cx", {
    value: new NativeFunctionValue(realm, "cx", "cx", 0, (context, [cxString]) => {
      invariant(cxString instanceof StringValue);
      let cxValue = `Bootloader("${cxString.value}")`;
      let cx;

      if (realm.fbLibraries.other.has(cxValue)) {
        cx = realm.fbLibraries.other.get(cxValue);
      } else {
        cx = createAbstract(realm, "function", cxValue);
        realm.fbLibraries.other.set(cxValue, cx);
      }
      invariant(cx instanceof AbstractValue);
      return cx;
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });

  global.$DefineOwnProperty("Bootloader", {
    value: new NativeFunctionValue(realm, "Bootloader", "Bootloader", 0, (context, [bootloaderString]) => {
      invariant(bootloaderString instanceof StringValue);
      let bootloaderValue = `Bootloader("${bootloaderString.value}")`;
      let bootloader;

      if (realm.fbLibraries.other.has(bootloaderValue)) {
        bootloader = realm.fbLibraries.other.get(bootloaderValue);
      } else {
        bootloader = createAbstract(realm, "function", bootloaderValue);
        realm.fbLibraries.other.set(bootloaderValue, bootloader);
      }
      invariant(bootloader instanceof AbstractValue);
      return bootloader;
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
