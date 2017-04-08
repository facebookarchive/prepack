/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { shouldIgnorePath } from "./Serializer.js";
import type { ClosureRefVisitorState } from "./Serializer.js";
import { BabelTraversePath } from "babel-traverse";
import { IsUnresolvableReference, ResolveBinding } from "../methods/index.js";

function visitName(state, name, modified) {
  let doesNotMatter = true;
  let ref = state.serializer.tryQuery(
    () => ResolveBinding(state.realm, name, doesNotMatter, state.val.$Environment),
    undefined, true);
  if (ref === undefined) return;
  if (IsUnresolvableReference(state.realm, ref)) return;
  state.map[name] = true;
  if (modified) state.functionInfo.modified[name] = true;
}

// TODO doesn't check that `arguments` and `this` is in top function
export default {
  ReferencedIdentifier(path: BabelTraversePath, state: ClosureRefVisitorState) {
    if (shouldIgnorePath(path)) return;

    let innerName = path.node.name;
    if (innerName === "arguments") {
      state.functionInfo.usesArguments = true;
      return;
    }
    if (path.scope.hasBinding(innerName, /*noGlobals*/true)) return;
    visitName(state, innerName, false);
  },

  ThisExpression(path: BabelTraversePath, state: ClosureRefVisitorState) {
    state.functionInfo.usesThis = true;
  },

  CallExpression(path: BabelTraversePath, state: ClosureRefVisitorState) {
    /*
    This optimization replaces requires to initialized modules with their return
    values. It does this by checking whether the require call has any side effects
    (e.g. modifications to the global module table). Conceptually if a call has
    no side effects, it should be safe to replace with its return value.

    This optimization is not safe in general because it allows for reads to mutable
    global state, but in the case of require, the return value is guaranteed to always
    be the same regardless of that global state modification (because we should
    only be reading from the global module table).
    */
    if (!state.isRequire || !state.isRequire(path.scope, path.node)) return;

    let moduleId = path.node.arguments[0].value;
    state.requiredModules.add(moduleId);
  },

  "AssignmentExpression|UpdateExpression"(path: BabelTraversePath, state: ClosureRefVisitorState) {
    for (let name in path.getBindingIdentifiers()) {
      if (path.scope.hasBinding(name, /*noGlobals*/true)) continue;
      visitName(state, name, true);
    }
  }
};
