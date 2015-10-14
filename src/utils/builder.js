/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import buildTemplate from "babel-template";
import type { BabelNodeExpression } from "babel-types";

export default function buildExpressionTemplate(code: string): (any => BabelNodeExpression) {
  let template;
  return function (obj: any): BabelNodeExpression {
    if (template === undefined) template = buildTemplate(code);
    let result = template(obj).expression;
    if (result === undefined) throw new Error("Code does not represent an expression: " + code);
    return result;
  };
}
