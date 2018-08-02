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
import {
  AbstractObjectValue,
  AbstractValue,
  FunctionValue,
  ObjectValue,
  StringValue,
  SymbolValue,
  Value,
} from "../values/index.js";
import { ResidualHeapVisitor } from "./ResidualHeapVisitor.js";
import { determineIfReactElementCanBeHoisted } from "../react/hoisting.js";
import { traverseReactElement } from "../react/elements.js";
import {
  canExcludeReactElementObjectProperty,
  getProperty,
  getReactSymbol,
  hardModifyReactObjectPropertyBinding,
} from "../react/utils.js";
import invariant from "../invariant.js";
import { TemporalOperationEntry } from "../utils/generator.js";
import { ReactEquivalenceSet } from "../react/ReactEquivalenceSet.js";
import { ReactElementSet } from "../react/ReactElementSet.js";
import { ReactPropsSet } from "../react/ReactPropsSet.js";
import type { ReactOutputTypes } from "../options.js";
import { Get } from "../methods/index.js";

export opaque type ReactEquivalenceSetSave = {|
  +reactEquivalenceSet: ReactEquivalenceSet,
  +reactElementEquivalenceSet: ReactElementSet,
  +reactPropsEquivalenceSet: ReactPropsSet,
|};

export class ResidualReactElementVisitor {
  constructor(realm: Realm, residualHeapVisitor: ResidualHeapVisitor) {
    this.realm = realm;
    this.residualHeapVisitor = residualHeapVisitor;
    this.reactOutput = realm.react.output || "create-element";
    this.defaultEquivalenceSet = true;
    this.reactEquivalenceSet = new ReactEquivalenceSet(realm, this);
    this.reactElementEquivalenceSet = new ReactElementSet(realm, this.reactEquivalenceSet);
    this.reactPropsEquivalenceSet = new ReactPropsSet(realm, this.reactEquivalenceSet);
  }

  realm: Realm;
  residualHeapVisitor: ResidualHeapVisitor;
  reactOutput: ReactOutputTypes;
  defaultEquivalenceSet: boolean;
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
        let reactElementStringTypeReferences = this.realm.react.reactElementStringTypeReferences;

        // If the type is a text value, and we have a derived reference for it
        // then use that derived reference instead of the string value. This is
        // primarily designed around RCTView and RCTText, which are string values
        // for RN apps, but are treated as special host components.
        if (typeValue instanceof StringValue && reactElementStringTypeReferences.has(typeValue.value)) {
          let reference = reactElementStringTypeReferences.get(typeValue.value);
          invariant(reference instanceof AbstractValue);
          hardModifyReactObjectPropertyBinding(this.realm, reactElement, "type", reference);
          this.residualHeapVisitor.visitValue(reference);
          return;
        }
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

    // Our serializer requires that every value we serialize must first be visited in every scope where it appears. In
    // our React element serializer we serialize some values (namely `React.createElement` and `React.Fragment`) that do
    // not necessarily appear in our source code. We must manually visit these values in our visitor pass for the values
    // to be serializable.
    if (this.realm.react.output === "create-element") {
      const reactLibraryObject = this._getReactLibraryValue();
      invariant(reactLibraryObject instanceof ObjectValue);
      const createElement = reactLibraryObject.properties.get("createElement");
      invariant(createElement !== undefined);
      const reactCreateElement = Get(this.realm, reactLibraryObject, "createElement");
      // Our `createElement` value will be used in the prelude of the optimized function we serialize to initialize
      // our hoisted React elements. So we need to ensure that we visit our value in a scope above our own to allow
      // the function to be used in our optimized function prelude. We use our global scope to accomplish this. We are
      // a "friend" class of `ResidualHeapVisitor` so we call one of its private methods.
      this.residualHeapVisitor._visitInUnrelatedScope(this.residualHeapVisitor.globalGenerator, reactCreateElement);
    }
    if (isReactFragment) {
      const reactLibraryObject = this._getReactLibraryValue();
      // Our `React.Fragment` value will be used in the function to lazily initialize hoisted JSX elements. So we need
      // to visit the library in our global generator so that it is available when creating the hoisted elements.
      this.residualHeapVisitor._visitInUnrelatedScope(this.residualHeapVisitor.globalGenerator, reactLibraryObject);
    }

    // determine if this ReactElement node tree is going to be hoistable
    determineIfReactElementCanBeHoisted(this.realm, reactElement, this.residualHeapVisitor);
  }

  withCleanEquivalenceSet(func: () => void): void {
    let defaultEquivalenceSet = this.defaultEquivalenceSet;
    let reactEquivalenceSet = this.reactEquivalenceSet;
    let reactElementEquivalenceSet = this.reactElementEquivalenceSet;
    let reactPropsEquivalenceSet = this.reactPropsEquivalenceSet;
    this.defaultEquivalenceSet = false;
    this.reactEquivalenceSet = new ReactEquivalenceSet(this.realm, this);
    this.reactElementEquivalenceSet = new ReactElementSet(this.realm, this.reactEquivalenceSet);
    this.reactPropsEquivalenceSet = new ReactPropsSet(this.realm, this.reactEquivalenceSet);
    func();
    // Cleanup
    this.defaultEquivalenceSet = defaultEquivalenceSet;
    this.reactEquivalenceSet = reactEquivalenceSet;
    this.reactElementEquivalenceSet = reactElementEquivalenceSet;
    this.reactPropsEquivalenceSet = reactPropsEquivalenceSet;
  }

  saveEquivalenceSet(): ReactEquivalenceSetSave {
    const { reactEquivalenceSet, reactElementEquivalenceSet, reactPropsEquivalenceSet } = this;
    return { reactEquivalenceSet, reactElementEquivalenceSet, reactPropsEquivalenceSet };
  }

  loadEquivalenceSet<T>(save: ReactEquivalenceSetSave, func: () => T): T {
    const defaultEquivalenceSet = this.defaultEquivalenceSet;
    const reactEquivalenceSet = this.reactEquivalenceSet;
    const reactElementEquivalenceSet = this.reactElementEquivalenceSet;
    const reactPropsEquivalenceSet = this.reactPropsEquivalenceSet;
    this.defaultEquivalenceSet = false;
    this.reactEquivalenceSet = save.reactEquivalenceSet;
    this.reactElementEquivalenceSet = save.reactElementEquivalenceSet;
    this.reactPropsEquivalenceSet = save.reactPropsEquivalenceSet;
    const result = func();
    // Cleanup
    this.defaultEquivalenceSet = defaultEquivalenceSet;
    this.reactEquivalenceSet = reactEquivalenceSet;
    this.reactElementEquivalenceSet = reactElementEquivalenceSet;
    this.reactPropsEquivalenceSet = reactPropsEquivalenceSet;
    return result;
  }

  wasTemporalAliasDeclaredInCurrentScope(temporalAlias: AbstractObjectValue): boolean {
    let scope = this.residualHeapVisitor.scope;
    if (scope instanceof FunctionValue) {
      return false;
    }
    // If the temporal has already been visited, then we know the temporal
    // value was used and thus declared in another scope
    if (this.residualHeapVisitor.values.has(temporalAlias)) {
      return false;
    }
    // Otherwise, we check the current scope and see if the
    // temporal value was declared in one of the entries
    for (let i = 0; i < scope._entries.length; i++) {
      let entry = scope._entries[i];
      if (entry instanceof TemporalOperationEntry) {
        if (entry.declared === temporalAlias) {
          return true;
        }
      }
    }
    return false;
  }

  _getReactLibraryValue() {
    const reactLibraryObject = this.realm.fbLibraries.react;
    invariant(reactLibraryObject, "Unable to find React library reference in scope.");
    return reactLibraryObject;
  }
}
