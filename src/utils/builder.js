/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import buildTemplate from "@babel/template";
import type { BabelNodeExpression } from "@babel/types";
import type { PreludeGenerator } from "./generator.js";
import invariant from "../invariant.js";

const placeholders = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const placeholderWhitelist = new Set(["global", ...placeholders]);

export default function buildExpressionTemplate(code: string): (void | PreludeGenerator) => any => BabelNodeExpression {
  let template;
  return (preludeGenerator: void | PreludeGenerator) => (obj: any): BabelNodeExpression => {
    if (template === undefined) template = buildTemplate(code, { placeholderPattern: false, placeholderWhitelist });
    if (preludeGenerator !== undefined && code.includes("global"))
      obj = Object.assign(
        {
          global: preludeGenerator.memoizeReference("global"),
        },
        obj
      );
    let result = template(obj).expression;
    invariant(result !== undefined, "Code does not represent an expression: " + code);
    return result;
  };
}
