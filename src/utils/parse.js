/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { SourceType } from "../types.js";
import type { Realm } from "../realm.js";
import { ThrowCompletion } from "../completions.js";
import { StringValue } from "../values/index.js";
import { Construct } from "../methods/construct.js";
import traverse from "babel-traverse";
import { parse } from "babylon";
import type { BabelNodeFile } from "babel-types";

export default function (realm: Realm, code: string, filename: string, sourceType: SourceType = "script"): BabelNodeFile {
  try {
    let ast = parse(code, { filename, sourceType });
    traverse.cheap(ast, (node) => {
      node.loc.source = filename;
    });
    return ast;
  } catch (e) {
    if (e instanceof SyntaxError) {
      // Babel reports all errors as syntax errors, even if a SyntaxError should be thrown.
      // What we do here is a totally robust way to address that issue.
      let referenceErrors = [
        'Invalid left-hand side in postfix operation',
        'Invalid left-hand side in prefix operation',
        'Invalid left-hand side in assignment expression',
      ];

      if (referenceErrors.some((msg) => e.message.indexOf(msg) >= 0)) {
        throw new ThrowCompletion(
          Construct(realm, realm.intrinsics.ReferenceError, [new StringValue(realm, e.message)])
        );
      } else {
        throw new ThrowCompletion(
          Construct(realm, realm.intrinsics.SyntaxError, [new StringValue(realm, e.message)])
        );
      }
    } else {
      throw e;
    }
  }
}
