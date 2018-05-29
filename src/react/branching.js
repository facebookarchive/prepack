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
import {
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

// Branch state is used to capture branched ReactElements so they can be analyzed and compared
// once all branches have been processed. This allows us to add keys to the respective ReactElement
// objects depending on various heuristics (if they have the same "type" for example)
// A new branch state is created on a branch status of "NEW_BRANCH" and is reset to null once the branch is no
// longer new
export function getValueWithBranchingLogicApplied(
  realm: Realm,
  parentX: Value,
  parentY: Value,
  value: AbstractValue
): Value {
  let needsKeys = false;

  const findMatchingHostTypes = (xTypeParent, yTypeParent) => {
    let [, x, y] = value.args;
    if (x instanceof ObjectValue && isReactElement(x) && y instanceof ObjectValue && isReactElement(y)) {
      let xType = getProperty(realm, x, "type");
      let yType = getProperty(realm, y, "type");

      if (xType.equals(yType) && !xTypeParent.equals(xType) && !yTypeParent.equals(yType)) {
        needsKeys = true;
      }
    }
  };

  const findMismatchingNonHostTypes = (x: Value, y: Value): void => {
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
            findMismatchingNonHostTypes(xChildren, yChildren);
          }
        }
      } else if (!xType.equals(yType)) {
        return findMatchingHostTypes(xType, yType);
      }
    } else if (x instanceof ArrayValue && y instanceof ArrayValue) {
      forEachArrayValue(realm, x, (xElem, index) => {
        let yElem = getProperty(realm, y, index + "");

        if (xElem instanceof Value && yElem instanceof Value) {
          findMismatchingNonHostTypes(xElem, yElem);
        }
      });
    }
  };

  findMismatchingNonHostTypes(parentX, parentY);

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
          () => applyBranchedLogicValue(realm, consequentVal),
          null,
          "applyBranchedLogicValue consequent"
        );
      },
      () => {
        return realm.evaluateForEffects(
          () => applyBranchedLogicValue(realm, alternateVal),
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
