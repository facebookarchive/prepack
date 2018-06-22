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
import { AbstractValue, ObjectValue, SymbolValue, Value } from "../values/index.js";
import { ResidualHeapVisitor } from "./ResidualHeapVisitor.js";
import { determineIfReactElementCanBeHoisted } from "../react/hoisting.js";
import { traverseReactElement } from "../react/elements.js";
import { canExcludeReactElementObjectProperty, getProperty, getReactSymbol } from "../react/utils.js";
import invariant from "../invariant.js";
import { ReactEquivalenceSet } from "../react/ReactEquivalenceSet.js";
import { ReactElementSet } from "../react/ReactElementSet.js";
import { ReactPropsSet } from "../react/ReactPropsSet.js";
import type { ReactOutputTypes } from "../options.js";

export class ResidualReactElementVisitor {
  constructor(realm: Realm, residualHeapVisitor: ResidualHeapVisitor) {
    this.realm = realm;
    this.residualHeapVisitor = residualHeapVisitor;
    this.reactOutput = realm.react.output || "create-element";
    this.someReactElement = undefined;
    this.reactEquivalenceSet = new ReactEquivalenceSet(realm, this);
    this.reactElementEquivalenceSet = new ReactElementSet(realm, this.reactEquivalenceSet);
    this.reactPropsEquivalenceSet = new ReactPropsSet(realm, this.reactEquivalenceSet);
  }

  realm: Realm;
  residualHeapVisitor: ResidualHeapVisitor;
  reactOutput: ReactOutputTypes;
  someReactElement: void | ObjectValue;
  reactEquivalenceSet: ReactEquivalenceSet;
  reactElementEquivalenceSet: ReactElementSet;
  reactPropsEquivalenceSet: ReactPropsSet;

  visitReactElement(reactElement: ObjectValue): void {
    let reactElementData = this.realm.react.reactElements.get(reactElement);
    invariant(reactElementData !== undefined);
    let { firstRenderOnly } = reactElementData;
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
        if (!firstRenderOnly) {
          this.residualHeapVisitor.visitValue(refValue);
        }
      },
      visitAbstractOrPartialProps: (propsValue: AbstractValue | ObjectValue) => {
        this.residualHeapVisitor.visitValue(propsValue);
      },
      visitConcreteProps: (propsValue: ObjectValue) => {
        for (let [propName, binding] of propsValue.properties) {
          invariant(propName !== "key" && propName !== "ref", `"${propName}" is a reserved prop name`);
          if (binding.descriptor === undefined || propName === "children") {
            continue;
          }
          let propValue = getProperty(this.realm, propsValue, propName);
          if (canExcludeReactElementObjectProperty(this.realm, reactElement, propName, propValue)) {
            continue;
          }
          this.residualHeapVisitor.visitValue(propValue);
        }
      },
      visitChildNode: (childValue: Value) => {
        this.residualHeapVisitor.visitValue(childValue);
      },
    });

    if (this.realm.react.output === "create-element" || isReactFragment) {
      this.someReactElement = reactElement;
    }
    // determine if this ReactElement node tree is going to be hoistable
    determineIfReactElementCanBeHoisted(this.realm, reactElement, this.residualHeapVisitor);
  }

  withCleanEquivalenceSet(func: () => void) {
    let reactEquivalenceSet = this.reactEquivalenceSet;
    let reactElementEquivalenceSet = this.reactElementEquivalenceSet;
    let reactPropsEquivalenceSet = this.reactPropsEquivalenceSet;
    this.reactEquivalenceSet = new ReactEquivalenceSet(this.realm, this);
    this.reactElementEquivalenceSet = new ReactElementSet(this.realm, this.reactEquivalenceSet);
    this.reactPropsEquivalenceSet = new ReactPropsSet(this.realm, this.reactEquivalenceSet);
    func();
    // Cleanup
    this.reactEquivalenceSet = reactEquivalenceSet;
    this.reactElementEquivalenceSet = reactElementEquivalenceSet;
    this.reactPropsEquivalenceSet = reactPropsEquivalenceSet;
  }
}
