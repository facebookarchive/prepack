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
import type { ReactOutputTypes } from "../options.js";
import type { ReactSetKeyMap } from "../react/equivalence.js";

export class ResidualReactElementVisitor {
  constructor(realm: Realm, residualHeapVisitor: ResidualHeapVisitor) {
    this.realm = realm;
    this.residualHeapVisitor = residualHeapVisitor;
    this.reactOutput = realm.react.output || "create-element";
    this.someReactElement = undefined;
    this.reactElementRoot = new Map();
    this.reactPropsRoot = new Map();
    this.objectRoot = new Map();
    this.arrayRoot = new Map();
  }

  realm: Realm;
  residualHeapVisitor: ResidualHeapVisitor;
  reactOutput: ReactOutputTypes;
  someReactElement: void | ObjectValue;
  reactElementRoot: ReactSetKeyMap;
  reactPropsRoot: ReactSetKeyMap;
  objectRoot: ReactSetKeyMap;
  arrayRoot: ReactSetKeyMap;

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
    let reactElementRoot = this.reactElementRoot;
    let reactPropsRoot = this.reactPropsRoot;
    let objectRoot = this.objectRoot;
    let arrayRoot = this.arrayRoot;
    this.reactElementRoot = new Map();
    this.reactPropsRoot = new Map();
    this.objectRoot = new Map();
    this.arrayRoot = new Map();
    func();
    // Cleanup
    this.reactElementRoot = reactElementRoot;
    this.reactPropsRoot = reactPropsRoot;
    this.objectRoot = objectRoot;
    this.arrayRoot = arrayRoot;
  }
}
