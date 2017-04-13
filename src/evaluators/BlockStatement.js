/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeBlockStatement } from "babel-types";
import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";

import { AbruptCompletion, NormalCompletion, PossiblyNormalCompletion, IntrospectionThrowCompletion } from "../completions.js";
import { Reference } from "../environment.js";
import { EmptyValue, StringValue, Value } from "../values/index.js";
import { joinPossiblyNormalCompletions, joinPossiblyNormalCompletionWithAbruptCompletion,
   NewDeclarativeEnvironment, BlockDeclarationInstantiation } from "../methods/index.js";
import invariant from "../invariant.js";

// ECMA262 13.2.13
export default function (ast: BabelNodeBlockStatement, strictCode: boolean, env: LexicalEnvironment, realm: Realm): NormalCompletion | Value | Reference {
  // 1. Let oldEnv be the running execution context's LexicalEnvironment.
  let oldEnv = realm.getRunningContext().lexicalEnvironment;

  // 2. Let blockEnv be NewDeclarativeEnvironment(oldEnv).
  let blockEnv = NewDeclarativeEnvironment(realm, oldEnv);

  // 3. Perform BlockDeclarationInstantiation(StatementList, blockEnv).
  BlockDeclarationInstantiation(realm, strictCode, ast.body, blockEnv);

  // 4. Set the running execution context's LexicalEnvironment to blockEnv.
  realm.getRunningContext().lexicalEnvironment = blockEnv;

  try {
    // 5. Let blockValue be the result of evaluating StatementList.
    let blockValue : void | NormalCompletion | Value;

    if (ast.directives) {
      for (let directive of (ast.directives)) {
        blockValue = new StringValue(realm, directive.value.value);
      }
    }

    for (let node of ast.body) {
      if (node.type !== "FunctionDeclaration") {
        let res = blockEnv.evaluateAbstractCompletion(node, strictCode);
        invariant(!(res instanceof Reference));
        if (!(res instanceof EmptyValue)) {
          if (blockValue === undefined || blockValue instanceof Value) {
            if (res instanceof AbruptCompletion) throw res;
            invariant(res instanceof NormalCompletion || res instanceof Value);
            blockValue = res;
          } else {
            invariant(blockValue instanceof PossiblyNormalCompletion);
            if (res instanceof AbruptCompletion) {
              let e = realm.get_captured_effects();
              invariant(e !== undefined);
              realm.stop_effect_capture();
              let [_c, _g, b, p, _o] = e;
              _c; _g; _o;
              realm.restoreBindings(b);
              realm.restoreProperties(p);
              if (res instanceof IntrospectionThrowCompletion) {
                realm.apply_effects(e);
                throw res;
              }
              invariant(blockValue instanceof PossiblyNormalCompletion);
              e[0] = res;
              let joined_effects = joinPossiblyNormalCompletionWithAbruptCompletion(realm, blockValue, res, e);
              realm.apply_effects(joined_effects);
              throw joined_effects[0];
            } else {
              if (res instanceof Value)
                blockValue.value = res;
              else {
                invariant(blockValue instanceof PossiblyNormalCompletion);
                invariant(res instanceof PossiblyNormalCompletion);
                blockValue = joinPossiblyNormalCompletions(realm, blockValue, res);
              }
            }
          }
        }
      }
    }

    // 7. Return blockValue.
    return blockValue || realm.intrinsics.empty;
  } finally {
    // 6. Set the running execution context's LexicalEnvironment to oldEnv.
    realm.getRunningContext().lexicalEnvironment = oldEnv;
  }
}
