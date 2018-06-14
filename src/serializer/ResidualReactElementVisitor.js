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
  NativeFunctionValue,
  ObjectValue,
  SymbolValue,
  Value,
  StringValue,
} from "../values/index.js";
import { ResidualHeapVisitor } from "./ResidualHeapVisitor.js";
import { determineIfReactElementCanBeHoisted } from "../react/hoisting.js";
import { traverseReactElement } from "../react/elements.js";
import { getProperty, getReactSymbol, isEventProp } from "../react/utils.js";
import invariant from "../invariant.js";
import ReactElementSet from "../react/ReactElementSet.js";
import type { ReactOutputTypes } from "../options.js";

function recursivelyVisitObjectsForFirstRender(
  realm: Realm,
  obj: ObjectValue | AbstractObjectValue,
  objectVisitCallback: (obj: ObjectValue | AbstractObjectValue) => void,
  alreadyVisited?: Set<ObjectValue | AbstractObjectValue> = new Set()
): void {
  if (alreadyVisited.has(obj)) {
    return;
  }
  alreadyVisited.add(obj);
  if (obj.temporalAlias === undefined) {
    if (obj instanceof AbstractObjectValue && !obj.values.isTop()) {
      for (let element of obj.values.getElements()) {
        recursivelyVisitObjectsForFirstRender(realm, element, objectVisitCallback, alreadyVisited);
      }
    } else if (obj instanceof ObjectValue) {
      objectVisitCallback(obj);
    }
  } else {
    let temporalArgs = realm.temporalAliasArgs.get(obj.temporalAlias);
    if (temporalArgs === undefined) {
      if (obj instanceof ObjectValue) {
        objectVisitCallback(obj);
      }
      return;
    }
    for (let temporalArg of temporalArgs) {
      if (
        temporalArg instanceof AbstractObjectValue ||
        (temporalArg instanceof ObjectValue &&
          !(temporalArg instanceof FunctionValue || temporalArg instanceof NativeFunctionValue))
      ) {
        recursivelyVisitObjectsForFirstRender(realm, temporalArg, objectVisitCallback, alreadyVisited);
      }
    }
  }
}

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
    let reactElementData = this.realm.react.reactElements.get(reactElement);
    invariant(reactElementData !== undefined);
    let { firstRenderOnly } = reactElementData;
    let isReactFragment = false;
    let isHostComponent = false;

    traverseReactElement(this.realm, reactElement, {
      visitType: (typeValue: Value) => {
        isReactFragment =
          typeValue instanceof SymbolValue && typeValue === getReactSymbol("react.fragment", this.realm);
        // we don't want to visit fragments as they are internal values
        if (!isReactFragment) {
          this.residualHeapVisitor.visitValue(typeValue);
        }
        if (typeValue instanceof StringValue) {
          isHostComponent = true;
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
        if (firstRenderOnly) {
          let objectVisitCallback = (object: ObjectValue) => {
            for (let [propName, binding] of object.properties) {
              if (binding && binding.descriptor && binding.descriptor.enumerable) {
                let propValue = getProperty(this.realm, object, propName);

                if (isHostComponent && (isEventProp(propName) || propValue instanceof FunctionValue)) {
                  // we should check how many times this object is visited
                  // as another object might be visiting it and require it
                  this.residualHeapVisitor.skipValues.add(propValue);
                }
              }
            }
          };
          recursivelyVisitObjectsForFirstRender(this.realm, propsValue, objectVisitCallback);
        }
        this.residualHeapVisitor.visitValue(propsValue);
      },
      visitConcreteProps: (propsValue: ObjectValue) => {
        for (let [propName, binding] of propsValue.properties) {
          invariant(propName !== "key" && propName !== "ref", `"${propName}" is a reserved prop name`);
          if (binding.descriptor === undefined || propName === "children") {
            continue;
          }
          let propValue = getProperty(this.realm, propsValue, propName);

          // In firstRenderOnly mode, we strip off onEventHanlders and any props
          // that are functions as they are not required for init render.
          if (firstRenderOnly && isHostComponent && (isEventProp(propName) || propValue instanceof FunctionValue)) {
            continue;
          }
          this.residualHeapVisitor.visitValue(propValue);
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
