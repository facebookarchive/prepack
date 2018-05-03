/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm } from "../realm.js";
import { AbstractValue, ArrayValue, NumberValue, ObjectValue, SymbolValue, Value } from "../values/index.js";
import { ResidualHeapVisitor } from "./ResidualHeapVisitor.js";
import { canHoistReactElement } from "../react/hoisting.js";
import { getProperty, getReactSymbol } from "../react/utils.js";
import ReactElementSet from "../react/ReactElementSet.js";
import type { ReactOutputTypes } from "../options.js";
import invariant from "../invariant.js";

export class ResidualReactElementVisitor {
  constructor(realm: Realm, residualHeapVisitor: ResidualHeapVisitor) {
    this.realm = realm;
    this.residualHeapVisitor = residualHeapVisitor;
    this.reactOutput = realm.react.output || "create-element";
    this.someReactElement = undefined;
    this.equivalenceSet = new ReactElementSet(realm, residualHeapVisitor.equivalenceSet);
  }

  realm: Realm;
  residualHeapVisitor: ResidualHeapVisitor;
  reactOutput: ReactOutputTypes;
  someReactElement: void | ObjectValue;
  equivalenceSet: ReactElementSet;

  _visitReactElementAttributes(reactElement: ObjectValue): void {
    let keyValue = getProperty(this.realm, reactElement, "key");
    let refValue = getProperty(this.realm, reactElement, "ref");
    let propsValue = getProperty(this.realm, reactElement, "props");

    if (keyValue !== this.realm.intrinsics.null && keyValue !== this.realm.intrinsics.undefined) {
      this.residualHeapVisitor.visitValue(keyValue);
    }
    if (refValue !== this.realm.intrinsics.null && refValue !== this.realm.intrinsics.undefined) {
      this.residualHeapVisitor.visitValue(refValue);
    }

    if (propsValue instanceof AbstractValue) {
      // visit object, as it's going to be spread
      this.residualHeapVisitor.visitValue(propsValue);
    } else if (propsValue instanceof ObjectValue) {
      if (propsValue.isPartialObject()) {
        this.residualHeapVisitor.visitValue(propsValue);
      } else {
        // given that props is a concrete object, it should never be serialized
        // as we'll be doing it directly with the ReactElementSerializer
        // so we make the object as refusing serialization
        propsValue.refuseSerialization = true;
        for (let [propName, binding] of propsValue.properties) {
          if (binding.descriptor !== undefined && propName !== "children") {
            let propValue = getProperty(this.realm, propsValue, propName);
            this.residualHeapVisitor.visitValue(propValue);
          }
        }
      }
    }
  }

  _visitReactElementChildren(reactElement: ObjectValue): void {
    let propsValue = getProperty(this.realm, reactElement, "props");
    if (!(propsValue instanceof ObjectValue)) {
      return;
    }
    // handle children
    if (propsValue.properties.has("children")) {
      let childrenValue = getProperty(this.realm, propsValue, "children");
      if (childrenValue !== this.realm.intrinsics.undefined && childrenValue !== this.realm.intrinsics.null) {
        if (childrenValue instanceof ArrayValue && !childrenValue.intrinsicName) {
          let childrenLength = getProperty(this.realm, childrenValue, "length");
          let childrenLengthValue = 0;
          if (childrenLength instanceof NumberValue) {
            childrenLengthValue = childrenLength.value;
            for (let i = 0; i < childrenLengthValue; i++) {
              let child = getProperty(this.realm, childrenValue, "" + i);
              invariant(
                child instanceof Value,
                `ReactElement "props.children[${i}]" failed to visit due to a non-value`
              );
              this.residualHeapVisitor.visitValue(child);
            }
          }
        } else {
          this.residualHeapVisitor.visitValue(childrenValue);
        }
      }
    }
  }

  visitReactElement(reactElement: ObjectValue): void {
    let typeValue = getProperty(this.realm, reactElement, "type");
    let isReactFragment =
      typeValue instanceof SymbolValue && typeValue === getReactSymbol("react.fragment", this.realm);

    // we don't want to visit fragments as they are internal values
    if (!isReactFragment) {
      this.residualHeapVisitor.visitValue(typeValue);
    }

    this._visitReactElementAttributes(reactElement);
    this._visitReactElementChildren(reactElement);

    if (this.realm.react.output === "create-element" || isReactFragment) {
      this.someReactElement = reactElement;
    }
    // check we can hoist a React Element
    canHoistReactElement(this.realm, reactElement, this.residualHeapVisitor);
  }

  withCleanEquivilanceSet(func: () => void) {
    let oldReactElementEquivalenceSet = this.equivalenceSet;
    this.equivalenceSet = new ReactElementSet(this.realm, this.residualHeapVisitor.equivalenceSet);
    func();
    // Cleanup
    this.equivalenceSet = oldReactElementEquivalenceSet;
  }
}
