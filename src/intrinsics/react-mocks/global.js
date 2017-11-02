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
import { AbstractValue, NativeFunctionValue, ObjectValue, Value } from "../../values/index.js";
import { ObjectCreate, CreateDataPropertyOrThrow, GetValue } from "../../methods/index.js";
import buildExpressionTemplate from "../../utils/builder.js";
import { createMockReactComponent, createMockReactCloneElement } from "./mocks.js";

export default function(realm: Realm): void {
  let global = realm.$GlobalObject;

  // module.exports support
  let exportsValue = ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  exportsValue.intrinsicName = "exports";
  let moduleValue = ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  moduleValue.intrinsicName = "module";
  moduleValue.$Set("exports", exportsValue, moduleValue);

  global.$DefineOwnProperty("module", {
    value: moduleValue,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  // require("SomeModule") support (makes them abstract)
  let type = Value.getTypeFromName("function");
  let requireValue = AbstractValue.createFromTemplate(
    realm,
    buildExpressionTemplate("require"),
    ((type: any): typeof Value),
    [],
    "require"
  );
  requireValue.intrinsicName = "require";
  global.$DefineOwnProperty("require", {
    value: requireValue,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  // apply React mock (for now just React.Component)
  global.$DefineOwnProperty("__createReactMock", {
    value: new NativeFunctionValue(realm, "global.__createReactMock", "__createReactMock", 0, (context, []) => {
      // React object
      let reactValue = ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
      reactValue.intrinsicName = "React";
      // React.Component
      let reactComponent = GetValue(realm, realm.$GlobalEnv.evaluate(createMockReactComponent(), false));
      reactComponent.intrinsicName = "React.Component";
      let prototypeValue = ((reactComponent: any): ObjectValue).properties.get("prototype");
      if (prototypeValue && prototypeValue.descriptor) {
        ((prototypeValue.descriptor.value: any): Value).intrinsicName = `React.Component.prototype`;
      }
      CreateDataPropertyOrThrow(realm, reactValue, "Component", reactComponent);
      // React.cloneElement
      let reactCloneElement = GetValue(realm, realm.$GlobalEnv.evaluate(createMockReactCloneElement(), false));
      reactCloneElement.intrinsicName = "React.cloneElement";
      CreateDataPropertyOrThrow(realm, reactValue, "cloneElement", reactCloneElement);
      return reactValue;
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
