/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import { StringValue, NumberValue, Value } from "../values/index.js";
import { GetIterator } from "../methods/index.js";
import invariant from "../invariant.js";
import { IteratorStep, IteratorValue } from "../methods/iterator.js";
import { Create, Environment, Properties } from "../singletons.js";
import type { BabelNodeArrayExpression } from "@babel/types";

// ECMA262 2.2.5.3
export default function(
  ast: BabelNodeArrayExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  // 1. Let array be ArrayCreate(0).
  let array = Create.ArrayCreate(realm, 0);

  // 2. Let len be the result of performing ArrayAccumulation for ElementList with arguments array and 0.
  let elements = ast.elements || [];
  let len = elements.length;
  let nextIndex = 0;
  for (let i = 0; i < len; i++) {
    let elem = elements[i];
    if (!elem) {
      nextIndex++;
      continue;
    }

    // ECMA262 12.2.5.2
    if (elem.type === "SpreadElement") {
      // 1. Let spreadRef be the result of evaluating AssignmentExpression.
      let spreadRef = env.evaluate(elem.argument, strictCode);

      // 2. Let spreadObj be ? GetValue(spreadRef).
      let spreadObj = Environment.GetValue(realm, spreadRef);

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
        let status = Create.CreateDataProperty(realm, array, new StringValue(realm, nextIndex++ + ""), nextValue);

        // e. Assert: status is true.
        invariant(status === true);

        // f. Let nextIndex be nextIndex + 1.
      }
    } else {
      // Redundant steps.
      // 1. Let postIndex be the result of performing ArrayAccumulation for ElementList with arguments array and nextIndex.
      // 2. ReturnIfAbrupt(postIndex).
      // 3. Let padding be the ElisionWidth of Elision; if Elision is not present, use the numeric value zero.

      // 4. Let initResult be the result of evaluating AssignmentExpression.
      let initResult = env.evaluate(elem, strictCode);

      // 5. Let initValue be ? GetValue(initResult).
      let initValue = Environment.GetValue(realm, initResult);

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
  return array;
}
