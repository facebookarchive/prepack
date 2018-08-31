/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../../realm.js";
import { AbstractValue, ArrayValue, NativeFunctionValue, StringValue, ObjectValue } from "../../values/index.js";
import { createMockReact } from "./react-mocks.js";
import { createMockReactDOM, createMockReactDOMServer } from "./react-dom-mocks.js";
import { createMockReactNative } from "./react-native-mocks.js";
import { createMockReactRelay } from "./relay-mocks.js";
import { createAbstract } from "../prepack/utils.js";
import { createFbMocks } from "./fb-mocks.js";
import { FatalError } from "../../errors";
import { Get } from "../../methods/index.js";
import invariant from "../../invariant";
import { createDefaultPropsHelper } from "../../react/utils.js";
import { PropertyDescriptor } from "../../descriptors.js";

export default function(realm: Realm): void {
  let global = realm.$GlobalObject;

  if (realm.react.enabled) {
    // Create it eagerly so it's created outside effect branches
    realm.react.defaultPropsHelper = createDefaultPropsHelper(realm);
    let emptyArray = new ArrayValue(realm);
    emptyArray.makeFinal();
    realm.react.emptyArray = emptyArray;
    let emptyObject = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
    emptyObject.makeFinal();
    realm.react.emptyObject = emptyObject;
  }

  // module.exports support
  let moduleValue = AbstractValue.createAbstractObject(realm, "module");
  moduleValue.kind = "resolved";
  let moduleExportsValue = AbstractValue.createAbstractObject(realm, "module.exports");
  moduleExportsValue.kind = "resolved";

  moduleValue.$DefineOwnProperty(
    "exports",
    new PropertyDescriptor({
      value: moduleExportsValue,
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );
  global.$DefineOwnProperty(
    "module",
    new PropertyDescriptor({
      value: moduleValue,
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  // apply require() mock
  global.$DefineOwnProperty(
    "require",
    new PropertyDescriptor({
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
        } else if (requireNameValValue === "react-dom" || requireNameValValue === "ReactDOM") {
          if (realm.fbLibraries.reactDom === undefined) {
            let reactDom = createMockReactDOM(realm, requireNameValValue);
            realm.fbLibraries.reactDom = reactDom;
            return reactDom;
          }
          return realm.fbLibraries.reactDom;
        } else if (requireNameValValue === "react-dom/server" || requireNameValValue === "ReactDOMServer") {
          if (realm.fbLibraries.reactDomServer === undefined) {
            let reactDomServer = createMockReactDOMServer(realm, requireNameValValue);
            realm.fbLibraries.reactDomServer = reactDomServer;
            return reactDomServer;
          }
          return realm.fbLibraries.reactDomServer;
        } else if (requireNameValValue === "react-native" || requireNameValValue === "ReactNative") {
          if (realm.fbLibraries.reactNative === undefined) {
            let reactNative = createMockReactNative(realm, requireNameValValue);
            realm.fbLibraries.reactNative = reactNative;
            return reactNative;
          }
          return realm.fbLibraries.reactNative;
        } else if (requireNameValValue === "react-relay" || requireNameValValue === "RelayModern") {
          if (realm.fbLibraries.reactRelay === undefined) {
            let reactRelay = createMockReactRelay(realm, requireNameValValue);
            realm.fbLibraries.reactRelay = reactRelay;
            return reactRelay;
          }
          return realm.fbLibraries.reactRelay;
        } else if (requireNameValValue === "prop-types" || requireNameValValue === "PropTypes") {
          if (realm.fbLibraries.react === undefined) {
            throw new FatalError("unable to require PropTypes due to React not being referenced in scope");
          }
          let propTypes = Get(realm, realm.fbLibraries.react, "PropTypes");
          invariant(propTypes instanceof ObjectValue);
          return propTypes;
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
    })
  );

  if (realm.isCompatibleWith("fb-www")) {
    createFbMocks(realm, global);
  }
}
