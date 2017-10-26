/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import * as t from "babel-types";

// this a mock of React.Component, to be used for tests
export function createMockReactComponent() {
  return t.classExpression(
    null,
    null,
    t.classBody([
      t.classMethod(
        "constructor",
        t.identifier("constructor"),
        [t.identifier("props"), t.identifier("context")],
        t.blockStatement([
          // this.props = props
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(t.thisExpression(), t.identifier("props")),
              t.identifier("props")
            )
          ),
          // this.context = context
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(t.thisExpression(), t.identifier("context")),
              t.identifier("context")
            )
          ),
          // this.state = {}
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(t.thisExpression(), t.identifier("state")),
              t.objectExpression([])
            )
          ),
          // this.ref = {}
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(t.thisExpression(), t.identifier("refs")),
              t.objectExpression([])
            )
          ),
        ])
      ),
      t.classMethod("method", t.identifier("getChildContext"), [], t.blockStatement([])),
    ]),
    []
  );
}
