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
import { AbstractValue, NativeFunctionValue, FunctionValue, ObjectValue, StringValue } from "../../values/index.js";
import buildExpressionTemplate from "../../utils/builder.js";
import { createMockReact } from "./react-mocks.js";
import { createMockReactRelay } from "./relay-mocks.js";
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

  // apply React mock (for now just React.Component)
  global.$DefineOwnProperty("require", {
    value: new NativeFunctionValue(realm, "global.require", "require", 0, (context, [requireNameVal]) => {
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
      }
      let requireName = `require("${requireNameVal.value}")`;
      let requireValue = AbstractValue.createTemporalFromTemplate(
        realm,
        buildExpressionTemplate(requireName),
        FunctionValue,
        [],
        { isPure: true, skipInvariant: true }
      );
      requireValue.intrinsicName = requireName;
      return requireValue;
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
