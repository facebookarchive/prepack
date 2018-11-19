/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNode, BabelNodeBlockStatement, BabelNodeProgram } from "@babel/types";

export default function IsStrict(node: BabelNode): boolean {
  if (node.type !== "BlockStatement" && node.type !== "Program") return false;
  let directives = ((node: any): BabelNodeBlockStatement | BabelNodeProgram).directives;
  if (!directives) return false;
  return directives.some(directive => {
    if (directive.type !== "Directive") {
      return false;
    }
    if (directive.value.type !== "DirectiveLiteral") {
      return false;
    }
    return directive.value.value === "use strict";
  });
}
