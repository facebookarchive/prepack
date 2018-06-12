/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { Realm } from "../realm.js";
import { AbstractObjectValue, AbstractValue, ObjectValue, SymbolValue, Value } from "../values/index.js";
import { ResidualHeapVisitor } from "./ResidualHeapVisitor.js";
import { determineIfReactElementCanBeHoisted } from "../react/hoisting.js";
import { traverseReactElement } from "../react/elements.js";
import { getProperty, getReactSymbol } from "../react/utils.js";
import ReactElementSet from "../react/ReactElementSet.js";
import type { ReactOutputTypes } from "../options.js";

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

  visitReactElement(reactElement: ObjectValue): void {
    let isReactFragment = false;

    traverseReactElement(this.realm, reactElement, {
      visitType: (typeValue: Value) => {
        isReactFragment =
          typeValue instanceof SymbolValue && typeValue === getReactSymbol("react.fragment", this.realm);
        // we don't want to visit fragments as they are internal values
        if (!isReactFragment) {
          this.residualHeapVisitor.visitValue(typeValue);
        }
      },
      visitKey: (keyValue: Value) => {
        this.residualHeapVisitor.visitValue(keyValue);
      },
      visitRef: (refValue: Value) => {
        this.residualHeapVisitor.visitValue(refValue);
      },
      visitAbstractOrPartialProps: (propsValue: AbstractValue | ObjectValue) => {
        if (propsValue.temporalAlias instanceof AbstractObjectValue) {
          this.residualHeapVisitor.visitValue(propsValue.temporalAlias);
        } else {
          this.residualHeapVisitor.visitValue(propsValue);
        }
      },
      visitConcreteProps: (propsValue: ObjectValue) => {
        for (let [propName, binding] of propsValue.properties) {
          if (binding.descriptor !== undefined && propName !== "children") {
            let propValue = getProperty(this.realm, propsValue, propName);
            this.residualHeapVisitor.visitValue(propValue);
          }
        }
      },
      visitChildNode: (childValue: Value) => {
        return this.residualHeapVisitor.visitEquivalentValue(childValue);
      },
    });

    if (this.realm.react.output === "create-element" || isReactFragment) {
      this.someReactElement = reactElement;
    }
    // determine if this ReactElement node tree is going to be hoistable
    determineIfReactElementCanBeHoisted(this.realm, reactElement, this.residualHeapVisitor);
  }

  withCleanEquivalenceSet(func: () => void) {
    let oldReactElementEquivalenceSet = this.equivalenceSet;
    this.equivalenceSet = new ReactElementSet(this.realm, this.residualHeapVisitor.equivalenceSet);
    func();
    // Cleanup
    this.equivalenceSet = oldReactElementEquivalenceSet;
  }
}
