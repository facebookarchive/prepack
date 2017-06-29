/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeExpression } from "babel-types";
import * as t from "babel-types";

export const voidExpression: BabelNodeExpression = t.unaryExpression("void", t.numericLiteral(0), true);
export const nullExpression: BabelNodeExpression = t.nullLiteral();
export const emptyExpression: BabelNodeIdentifier = t.identifier("__empty");
export const constructorExpression: BabelNodeIdentifier = t.identifier("__constructor");
export const protoExpression: BabelNodeIdentifier = t.identifier("__proto__");
