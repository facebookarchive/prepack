/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { FatalError } from "../errors.js";
import { ValuesDomain } from "../domains/index.js";
import invariant from "../invariant.js";
import { Realm } from "../realm.js";
import { AbstractValue, ConcreteValue, Value } from "../values/index.js";

export default function simplifyAbstractValue(realm: Realm, value: AbstractValue): Value {
  let savedHandler = realm.errorHandler;
  let savedIsReadOnly = realm.isReadOnly;
  realm.isReadOnly = true;
  try {
    realm.errorHandler = () => {
      throw new FatalError();
    };
    return simplify(realm, value);
  } catch (e) {
    return value;
  } finally {
    realm.errorHandler = savedHandler;
    realm.isReadOnly = savedIsReadOnly;
  }
}

function simplify(realm, value: Value): Value {
  if (value instanceof ConcreteValue) return value;
  invariant(value instanceof AbstractValue);
  switch (value.kind) {
    case "!":
      return negate(realm, value.args[0]);
    default:
      return value;
  }
}

function negate(realm: Realm, value: Value): Value {
  if (value instanceof ConcreteValue) return ValuesDomain.computeUnary(realm, "!", value);
  invariant(value instanceof AbstractValue);
  if (value.kind === "!") return value.args[0];
  // If NaN is not an issue, invert binary ops
  if (value.args.length === 2 && !value.args[0].mightBeNumber() && !value.args[1].mightBeNumber()) {
    let invertedComparison;
    switch (value.kind) {
      case "===":
        invertedComparison = "!==";
        break;
      case "==":
        invertedComparison = "!=";
        break;
      case "!==":
        invertedComparison = "===";
        break;
      case "!=":
        invertedComparison = "==";
        break;
      case "<":
        invertedComparison = ">=";
        break;
      case "<=":
        invertedComparison = ">";
        break;
      case ">":
        invertedComparison = "<=";
        break;
      case ">=":
        invertedComparison = "<";
        break;
      default:
        break;
    }
    if (invertedComparison !== undefined) {
      let left = simplify(realm, value.args[0]);
      let right = simplify(realm, value.args[1]);
      return AbstractValue.createFromBinaryOp(realm, invertedComparison, left, right, value.expressionLocation);
    }
    let invertedLogicalOp;
    switch (value.kind) {
      case "&&":
        invertedLogicalOp = "||";
        break;
      case "||":
        invertedLogicalOp = "&&";
        break;
      default:
        break;
    }
    if (invertedLogicalOp !== undefined) {
      let left = negate(realm, value.args[0]);
      let right = negate(realm, value.args[1]);
      return AbstractValue.createFromLogicalOp(realm, invertedLogicalOp, left, right, value.expressionLocation);
    }
  }
  return AbstractValue.createFromUnaryOp(realm, "!", value, true, value.expressionLocation);
}
