/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import invariant from "../invariant.js";
import type { SourceType } from "../types.js";
import type { Realm } from "../realm.js";
import { ThrowCompletion } from "../completions.js";
import { StringValue } from "../values/index.js";
import { Construct } from "../methods/construct.js";
import traverseFast from "./traverse-fast.js";
import { parse } from "@babel/parser";
import type { BabelNodeFile } from "@babel/types";

export default function(
  realm: Realm,
  code: string,
  filename: string,
  sourceType: SourceType = "script",
  startLine: number = 1
): BabelNodeFile {
  try {
    let plugins = ["objectRestSpread"];
    if (realm.react.enabled) {
      plugins.push("jsx");
    }
    if (realm.stripFlow) {
      plugins.push("flow");
    }
    let ast = parse(code, { filename, sourceType, startLine, plugins });
    traverseFast(ast, node => {
      invariant(node.loc);
      node.loc.source = filename;
      return false;
    });
    return ast;
  } catch (e) {
    if (e instanceof SyntaxError) {
      // Babel reports all errors as syntax errors, even if a ReferenceError should be thrown.
      // What we do here is a totally robust way to address that issue.
      let referenceErrors = [
        "Invalid left-hand side in postfix operation",
        "Invalid left-hand side in prefix operation",
        "Invalid left-hand side in assignment expression",
      ];

      let error;
      if (referenceErrors.some(msg => e.message.indexOf(msg) >= 0)) {
        error = Construct(realm, realm.intrinsics.ReferenceError, [new StringValue(realm, e.message)]);
      } else {
        error = Construct(realm, realm.intrinsics.SyntaxError, [new StringValue(realm, e.message)]);
      }
      error = error.throwIfNotConcreteObject();
      // These constructors are currently guaranteed to produce an object with
      // built-in error data. Append location information about the syntax error
      // and the source code to it so that we can use it to print nicer errors.
      invariant(error.$ErrorData);
      error.$ErrorData.locationData = {
        filename: filename,
        sourceCode: code,
        loc: e.loc,
        stackDecorated: false,
      };
      throw new ThrowCompletion(error, e.loc);
    } else {
      throw e;
    }
  }
}
