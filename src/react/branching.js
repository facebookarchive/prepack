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
import { isReactElement, addKeyToReactElement, forEachArrayValue, getProperty, mapArrayValue } from "./utils";
import { ExpectedBailOut } from "./errors.js";

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
  const searchAndFlagMatchingComponentTypes = (xTypeParent, yTypeParent) => {
    let [, x, y] = value.args;
    if (x instanceof ObjectValue && isReactElement(x) && y instanceof ObjectValue && isReactElement(y)) {
      let xType = getProperty(realm, x, "type");
      let yType = getProperty(realm, y, "type");

      if (xType.equals(yType) && !xTypeParent.equals(xType) && !yTypeParent.equals(yType)) {
        needsKeys = true;
      }
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
        searchAndFlagMatchingComponentTypes(xType, yType);
      }
    } else if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(x) ||
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(y)
    ) {
      // If either case is an unknown array, we do not know
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
    return applyBranchedLogicValue(realm, value);
  }
  return value;
}

// When we apply branching logic, it means to add keys to all ReactElement nodes
// we encounter, thus returning new ReactElements with the keys on them
function applyBranchedLogicValue(realm: Realm, value: Value): Value {
  if (
    value instanceof StringValue ||
    value instanceof NumberValue ||
    value instanceof BooleanValue ||
    value instanceof NullValue ||
    value instanceof UndefinedValue
  ) {
    // terminal values
  } else if (value instanceof ObjectValue && isReactElement(value)) {
    return addKeyToReactElement(realm, value);
  } else if (value instanceof ArrayValue) {
    return mapArrayValue(realm, value, elementValue => applyBranchedLogicValue(realm, elementValue));
  } else if (value instanceof AbstractValue && value.kind === "conditional") {
    let [condValue, consequentVal, alternateVal] = value.args;
    invariant(condValue instanceof AbstractValue);

    return realm.evaluateWithAbstractConditional(
      condValue,
      () => {
        return realm.evaluateForEffects(
          () => wrapReactElementInBranchOrReturnValue(realm, applyBranchedLogicValue(realm, consequentVal)),
          null,
          "applyBranchedLogicValue consequent"
        );
      },
      () => {
        return realm.evaluateForEffects(
          () => wrapReactElementInBranchOrReturnValue(realm, applyBranchedLogicValue(realm, alternateVal)),
          null,
          "applyBranchedLogicValue alternate"
        );
      }
    );
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
    let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
    value.copyKeys(value.$OwnPropertyKeys(), value, obj);
    let temporal = AbstractValue.createTemporalFromBuildFunction(realm, ObjectValue, [obj], ([node]) => node, {
      isPure: true,
      skipInvariant: true,
    });
    invariant(temporal instanceof AbstractObjectValue);
    temporal.values = new ValuesDomain(value);
    value.temporalAlias = temporal;
  }
  return value;
}
