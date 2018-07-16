/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeArrayExpression, BabelNodeStatement } from "@babel/types";
import type { LexicalEnvironment } from "../environment.js";
import type { Realm } from "../realm.js";

import { AbruptCompletion, PossiblyNormalCompletion } from "../completions.js";
import { FatalError } from "../errors.js";
import { GetIterator, GetMethod, IteratorStep, IteratorValue } from "../methods/index.js";
import { AbstractValue, NumberValue, ObjectValue, StringValue, Value } from "../values/index.js";
import { Create, Properties } from "../singletons.js";

import invariant from "../invariant.js";
import * as t from "@babel/types";

// ECMA262 2.2.5.3
export default function(
  ast: BabelNodeArrayExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): [AbruptCompletion | Value, BabelNodeArrayExpression, Array<BabelNodeStatement>] {
  // 1. Let array be ArrayCreate(0).
  let array = Create.ArrayCreate(realm, 0);

  // 2. Let len be the result of performing ArrayAccumulation for ElementList with arguments array and 0.
  let elements = ast.elements || [];
  let partial_elements = [];
  let io = [];
  let len = elements.length;
  let nextIndex = 0;
  for (let i = 0; i < len; i++) {
    let elem = elements[i];
    if (!elem) {
      nextIndex++;
      continue;
    }

    let elemValue, elemAst, elemIO;
    if (elem.type === "SpreadElement")
      [elemValue, elemAst, elemIO] = env.partiallyEvaluateCompletionDeref(elem.argument, strictCode);
    else [elemValue, elemAst, elemIO] = env.partiallyEvaluateCompletionDeref(elem, strictCode);
    io.concat(elemIO);
    if (elemValue instanceof AbruptCompletion) {
      return [elemValue, ast, io]; //todo: log an error message
    } else if (elemValue instanceof PossiblyNormalCompletion) {
      // TODO: there was a conditional abrupt completion while evaluating elem, so join states somehow
      AbstractValue.reportIntrospectionError(elemValue.value);
      throw new FatalError();
    }
    invariant(elemValue instanceof Value);
    partial_elements[nextIndex] = (elemAst: any);

    // ECMA262 12.2.5.2
    if (elem.type === "SpreadElement") {
      let spreadObj = elemValue;
      partial_elements[nextIndex] = t.spreadElement((elemAst: any));

      // update the abstract state with the contents of spreadObj, if known
      if (spreadObj instanceof ObjectValue && !spreadObj.isPartialObject()) {
        // 3. Let iterator be ? GetIterator(spreadObj).
        let iterator = GetIterator(realm, spreadObj);

        // 4. Repeat
        while (true) {
          // a. Let next be ? IteratorStep(iterator).
          let next = IteratorStep(realm, iterator);

          // b. If next is false, return nextIndex.
          if (next === false) break;

          // c. Let nextValue be ? IteratorValue(next).
          let nextValue = IteratorValue(realm, next);

          // d. Let status be CreateDataProperty(array, ToString(ToUint32(nextIndex)), nextValue).
          let status = Create.CreateDataProperty(realm, array, new StringValue(realm, nextIndex + ""), nextValue);

          // e. Assert: status is true.
          invariant(status === true);

          // f. Let nextIndex be nextIndex + 1.
          nextIndex++;
        }
      } else {
        // Update the abstract state to reflect our lack of complete knowledge
        // of all of the properties of the result of evaluating elem.
        array.makePartial();

        // terminate the loop if all elements have been processed
        if (i === len - 1) break;

        // If there are elements that come after this spread element, we need
        // to take their effects into account for the abstract state that results
        // from the array expression.

        // First check if the runtime spread operation cannot fail
        if (spreadObj instanceof AbstractValue && spreadObj.getType() === "Array") {
          let method = GetMethod(realm, spreadObj, realm.intrinsics.SymbolIterator);
          if (method === realm.intrinsics.ArrayProto_values) continue;
        }

        // At this point we have to be pessimistic and assume that iterating spreadObj may
        // throw an exception, in which case we can't assume that the remaining element
        // expressions will be evaluated at runtime. As a consequence their effects
        // have be provisional.
        // TODO: join states somehow
        AbstractValue.reportIntrospectionError(spreadObj);
        throw new FatalError();
      }
    } else if (array.isPartialObject()) {
      // Dealing with an array element that follows on a spread object that
      // could not be iterated at compile time, so the index that this element
      // will have at runtime is not known at this point.

      let abstractIndex = AbstractValue.createFromType(realm, NumberValue);
      array.$SetPartial(abstractIndex, elemValue, array);
    } else {
      // Redundant steps.
      // 1. Let postIndex be the result of performing ArrayAccumulation for ElementList with arguments array and nextIndex.
      // 2. ReturnIfAbrupt(postIndex).
      // 3. Let padding be the ElisionWidth of Elision; if Elision is not present, use the numeric value zero.

      // 4. Let initResult be the result of evaluating AssignmentExpression.
      // 5. Let initValue be ? GetValue(initResult).
      let initValue = elemValue;

      // 6. Let created be CreateDataProperty(array, ToString(ToUint32(postIndex+padding)), initValue).
      let created = Create.CreateDataProperty(realm, array, new StringValue(realm, nextIndex++ + ""), initValue);

      // 7. Assert: created is true.
      invariant(created === true, "expected data property creation");
    }
  }

  // Not necessary since we propagate completions with exceptions.
  // 3. ReturnIfAbrupt(len).

  // 4. Perform Set(array, "length", ToUint32(len), false).
  Properties.Set(realm, array, "length", new NumberValue(realm, nextIndex), false);

  // 5. NOTE: The above Set cannot fail because of the nature of the object returned by ArrayCreate.

  // 6. Return array.
  return [array, t.arrayExpression(partial_elements), io];
}
