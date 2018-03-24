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
  Value,
  UndefinedValue,
  StringValue,
  NumberValue,
  BooleanValue,
  NullValue,
  AbstractValue,
  ArrayValue,
  ObjectValue,
} from "../values/index.js";
import { type ReactSerializerState } from "../serializer/types.js";
import { isReactElement, addKeyToReactElement, forEachArrayValue } from "./utils";
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
export class BranchState {
  constructor() {
    this._branchesToValidate = [];
  }
  _branchesToValidate: Array<{
    type: Value,
    value: Value,
  }>;

  _applyBranchedLogicValue(realm: Realm, reactSerializerState: ReactSerializerState, value: Value): void {
    if (
      value instanceof StringValue ||
      value instanceof NumberValue ||
      value instanceof BooleanValue ||
      value instanceof NullValue ||
      value instanceof UndefinedValue
    ) {
      // terminal values
    } else if (value instanceof ObjectValue && isReactElement(value)) {
      addKeyToReactElement(realm, reactSerializerState, value);
    } else if (value instanceof ArrayValue) {
      forEachArrayValue(realm, value, elementValue => {
        this._applyBranchedLogicValue(realm, reactSerializerState, elementValue);
      });
    } else if (value instanceof AbstractValue) {
      let length = value.args.length;
      if (length > 0) {
        for (let i = 0; i < length; i++) {
          this._applyBranchedLogicValue(realm, reactSerializerState, value.args[i]);
        }
      }
    } else {
      throw new ExpectedBailOut("Unsupported value encountered when applying branched logic to values");
    }
  }

  applyBranchedLogic(realm: Realm, reactSerializerState: ReactSerializerState): boolean {
    let reactElementType;
    let applyBranchedLogic = false;

    for (let i = 0; i < this._branchesToValidate.length; i++) {
      let { type } = this._branchesToValidate[i];
      if (reactElementType === undefined) {
        reactElementType = type;
      } else if (type !== reactElementType) {
        // the types of the ReactElements do not match, so apply branch logic
        applyBranchedLogic = true;
        break;
      }
    }
    if (applyBranchedLogic) {
      for (let i = 0; i < this._branchesToValidate.length; i++) {
        this._applyBranchedLogicValue(realm, reactSerializerState, this._branchesToValidate[i].value);
      }
      return true;
    }
    return false;
  }

  mergeBranchedLogic(siblingBranchState: BranchState): void {
    this._branchesToValidate.push(...siblingBranchState.getBranchesToValidate());
  }

  getBranchesToValidate(): Array<{
    type: Value,
    value: Value,
  }> {
    return this._branchesToValidate;
  }

  captureBranchedValue(type: Value, value: Value): Value {
    this._branchesToValidate.push({ type, value });
    return value;
  }
}
