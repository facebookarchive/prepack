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
  ArrayValue,
  BooleanValue,
  NullValue,
  NumberValue,
  ObjectValue,
  StringValue,
  UndefinedValue,
  Value,
} from "../values/index.js";
import invariant from "../invariant.js";
import { ValuesDomain } from "../domains/index.js";
import {
  cloneReactElement,
  isReactElement,
  addKeyToReactElement,
  forEachArrayValue,
  getProperty,
  mapArrayValue,
} from "./utils.js";
import { ExpectedBailOut } from "./errors.js";
import { createOperationDescriptor } from "../utils/generator.js";

// Branch status is used for when Prepack returns an abstract value from a render
// that results in a conditional path occuring. This can be problematic for reconcilation
// as the reconciler then needs to understand if this is the start of a new branch, or if
// it's actually deep into an existing branch. If it's a new branch, we need to apply
// keys to the root JSX element so that it keeps it identity (because we're folding trees).
// Furthermore, we also need to bail-out of folding class components where they have lifecycle
// events, as we can't merge lifecycles of mutliple trees when branched reliably
export type BranchStatusEnum = "ROOT" | "NO_BRANCH" | "NEW_BRANCH" | "BRANCH";

// This function aims to determine if we need to add keys to the ReactElements
// of the returned conditional abstract value branches. It does this by first
// checking the parent branch nodes (these were use to render both respective branches)
// for any cases where ReactElement types on host components mismatch.
// Note: this implementation is not fully sound and is likely missing support
// for all React reconcilation cases for handling of keys, see issue #1131

export function getValueWithBranchingLogicApplied(
  realm: Realm,
  parentX: Value,
  parentY: Value,
  value: AbstractValue
): Value {
  let needsKeys = false;

  // we check the inlined value and see if the component types match
  const searchAndFlagMatchingComponentTypes = (x, y, xTypeParent, yTypeParent) => {
    // The returned value is the result of getting the "render" from a component.
    // We need to search the value returned to see if the nodes need keys adding to them.

    // 1. If we have <X? /> and <Y? />, then check if their
    // types are the same, if they are the same and the parent types
    // are not the same as then we need to add keys
    if (x instanceof ObjectValue && isReactElement(x) && y instanceof ObjectValue && isReactElement(y)) {
      let xType = getProperty(realm, x, "type");
      let yType = getProperty(realm, y, "type");

      if (xType.equals(yType) && !xTypeParent.equals(xType) && !yTypeParent.equals(yType)) {
        needsKeys = true;
      }
    } else if (x instanceof ArrayValue) {
      // If we have x: []
      // Go  through the elements of array x
      forEachArrayValue(realm, x, (xElem, index) => {
        let yElem = y;
        // And if we also have y: [], with a given element from x
        // search element of y at the same index from x.
        // If y is not an array, then continue but use x: [] against y
        if (y instanceof ArrayValue) {
          yElem = getProperty(realm, y, index + "");
        }
        searchAndFlagMatchingComponentTypes(xElem, yElem, xTypeParent, yTypeParent);
      });
    } else if (y instanceof ArrayValue) {
      // If we have y: []
      // Go  through the elements of array y
      forEachArrayValue(realm, y, (yElem, index) => {
        let xElem = x;
        // And if we also have x: [], with a given element from y
        // search element of x at the same index from y.
        // If x is not an array, then continue but use y: [] against x
        if (x instanceof ArrayValue) {
          xElem = getProperty(realm, x, index + "");
        }
        searchAndFlagMatchingComponentTypes(xElem, yElem, xTypeParent, yTypeParent);
      });
    } else if (x instanceof AbstractValue && x.kind === "conditional") {
      // if x is a conditional value like "a ? b : c",
      // then recusrively check b and c agaginst that y
      let [, consequentVal, alternateVal] = x.args;

      searchAndFlagMatchingComponentTypes(consequentVal, y, xTypeParent, yTypeParent);
      searchAndFlagMatchingComponentTypes(alternateVal, y, xTypeParent, yTypeParent);
    } else if (y instanceof AbstractValue && y.kind === "conditional") {
      // if y is a conditional value like "a ? b : c",
      // then recusrively check b and c agaginst that x
      let [, consequentVal, alternateVal] = y.args;

      searchAndFlagMatchingComponentTypes(x, consequentVal, xTypeParent, yTypeParent);
      searchAndFlagMatchingComponentTypes(x, alternateVal, xTypeParent, yTypeParent);
    }
  };

  // we first check our "parent" value, that was used to get the inlined value
  const searchAndFlagMismatchingNonHostTypes = (x: Value, y: Value, arrayDepth: number): void => {
    if (x instanceof ObjectValue && isReactElement(x) && y instanceof ObjectValue && isReactElement(y)) {
      let xType = getProperty(realm, x, "type");
      let yType = getProperty(realm, y, "type");

      if (xType instanceof StringValue && yType instanceof StringValue) {
        let xProps = getProperty(realm, x, "props");
        let yProps = getProperty(realm, y, "props");
        if (xProps instanceof ObjectValue && yProps instanceof ObjectValue) {
          let xChildren = getProperty(realm, xProps, "children");
          let yChildren = getProperty(realm, yProps, "children");

          if (xChildren instanceof Value && yChildren instanceof Value) {
            searchAndFlagMismatchingNonHostTypes(xChildren, yChildren, arrayDepth);
          }
        }
      } else if (!xType.equals(yType)) {
        let [, xVal, yVal] = value.args;
        searchAndFlagMatchingComponentTypes(xVal, yVal, xType, yType);
      }
    } else if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(x) ||
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(y)
    ) {
      // If either case is an array with wideneded properties, we do not know
      // the contents of the array, so we cannot add keys
    } else if (x instanceof ArrayValue && arrayDepth === 0) {
      forEachArrayValue(realm, x, (xElem, index) => {
        let yElem;
        if (y instanceof ArrayValue) {
          // handle the case of [x].equals([y])
          yElem = getProperty(realm, y, index + "");
        } else if (index === 0) {
          // handle the case of [x].equals(y)
          yElem = y;
        }

        if (xElem instanceof Value && yElem instanceof Value) {
          searchAndFlagMismatchingNonHostTypes(xElem, yElem, arrayDepth + 1);
        }
      });
    } else if (y instanceof ArrayValue && arrayDepth === 0) {
      forEachArrayValue(realm, y, (yElem, index) => {
        let xElem;
        if (x instanceof ArrayValue) {
          // handle the case of [y].equals([x]
          xElem = getProperty(realm, x, index + "");
        } else if (index === 0) {
          // handle the case of [y].equals(x)
          xElem = x;
        }

        if (xElem instanceof Value && yElem instanceof Value) {
          searchAndFlagMismatchingNonHostTypes(xElem, yElem, arrayDepth + 1);
        }
      });
    }
  };

  searchAndFlagMismatchingNonHostTypes(parentX, parentY, 0);

  if (needsKeys) {
    return applyBranchedLogicValue(realm, value, false);
  }
  return value;
}

// When we apply branching logic, it means to add keys to all ReactElement nodes
// we encounter, thus returning new ReactElements with the keys on them
function applyBranchedLogicValue(realm: Realm, value: Value, inBranch: boolean): Value {
  if (
    value instanceof StringValue ||
    value instanceof NumberValue ||
    value instanceof BooleanValue ||
    value instanceof NullValue ||
    value instanceof UndefinedValue
  ) {
    // terminal values
  } else if (value instanceof ObjectValue && isReactElement(value)) {
    if (inBranch) {
      return wrapReactElementInBranchOrReturnValue(realm, addKeyToReactElement(realm, value));
    } else {
      return addKeyToReactElement(realm, value);
    }
  } else if (value instanceof ArrayValue) {
    let newArray = mapArrayValue(realm, value, elementValue => applyBranchedLogicValue(realm, elementValue, inBranch));
    newArray.makeFinal();
    return newArray;
  } else if (value instanceof AbstractValue && value.kind === "conditional") {
    let [condValue, consequentVal, alternateVal] = value.args;
    invariant(condValue instanceof AbstractValue);

    return realm.evaluateWithAbstractConditional(
      condValue,
      () => {
        return realm.evaluateForEffects(
          () => applyBranchedLogicValue(realm, consequentVal, true),
          null,
          "applyBranchedLogicValue consequent"
        );
      },
      () => {
        return realm.evaluateForEffects(
          () => applyBranchedLogicValue(realm, alternateVal, true),
          null,
          "applyBranchedLogicValue alternate"
        );
      }
    );
  } else if (value instanceof AbstractValue && (value.kind === "||" || value.kind === "&&")) {
    invariant(false, "applyBranchedLogicValue encounterted a logical expression (|| or &&), this should never occur");
  } else {
    throw new ExpectedBailOut("Unsupported value encountered when applying branched logic to values");
  }
  return value;
}

// when a ReactElement is resolved in a conditional branch we
// can improve runtime performance by ensuring that the ReactElement
// is only created lazily in that specific branch and referenced
// from then on. To do this we create a temporal abstract value
// and set its kind to "branched ReactElement" so we properly track
// the original ReactElement. If we don't have a ReactElement,
// return the original value
export function wrapReactElementInBranchOrReturnValue(realm: Realm, value: Value): Value {
  if (value instanceof ObjectValue && isReactElement(value)) {
    let temporal = AbstractValue.createTemporalFromBuildFunction(
      realm,
      ObjectValue,
      [cloneReactElement(realm, value, false)],
      createOperationDescriptor("SINGLE_ARG"),
      { isPure: true, skipInvariant: true }
    );
    invariant(temporal instanceof AbstractObjectValue);
    temporal.values = new ValuesDomain(value);
    value.temporalAlias = temporal;
  }
  return value;
}
