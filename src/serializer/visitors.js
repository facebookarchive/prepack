/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm } from "../realm.js";
import { IsUnresolvableReference, ResolveBinding } from "../methods/index.js";
import { FunctionValue } from "../values/index.js";
import * as t from "babel-types";
import type { BabelNodeExpression, BabelNodeCallExpression } from "babel-types";
import { BabelTraversePath } from "babel-traverse";
import type { TryQuery, FunctionInfo, Names } from "./types.js";

export type ClosureRefVisitorState = {
  tryQuery: TryQuery<*>,
  val: FunctionValue;
  reasons: Array<string>;
  name: string;
  functionInfo: FunctionInfo;
  map: Names;
  realm: Realm;
  requiredModules: Set<number | string>;
  isRequire: void | (scope: any, node: BabelNodeCallExpression) => boolean;
};

export type ClosureRefReplacerState = {
  serializedBindings: any,
  modified: Names;
  requireReturns: Map<number | string, BabelNodeExpression>;
  requireStatistics: { replaced: 0, count: 0 };
  isRequire: void | (scope: any, node: BabelNodeCallExpression) => boolean;
}

function markVisited(node, data) {
  (node: any)._renamedOnce = data;
}

function shouldVisit(node, data) {
  return (node: any)._renamedOnce !== data;
}

// replaceWith causes the node to be re-analysed, so to prevent double replacement
// we add this property on the node to mark it such that it does not get replaced
// again on this pass
// TODO: Make this work when replacing with arbitrary BabelNodeExpressions. Currently
//       if the node that we're substituting contains identifiers as children,
//       they will be visited again and possibly transformed.
//       If necessary we could implement this by following node.parentPath and checking
//       if any parent nodes are marked visited, but that seem unnecessary right now.let closureRefReplacer = {
export let ClosureRefReplacer = {
  ReferencedIdentifier(path: BabelTraversePath, state: ClosureRefReplacerState) {
    if (ignorePath(path)) return;

    let serializedBindings = state.serializedBindings;
    let innerName = path.node.name;
    if (path.scope.hasBinding(innerName, /*noGlobals*/true)) return;

    let serializedBinding = serializedBindings[innerName];
    if (serializedBinding && shouldVisit(path.node, serializedBindings)) {
      markVisited(serializedBinding.serializedValue, serializedBindings);
      path.replaceWith(serializedBinding.serializedValue);
    }
  },

  CallExpression(path: BabelTraversePath, state: ClosureRefReplacerState) {
    // Here we apply the require optimization by replacing require calls with their
    // corresponding initialized modules.
    let requireReturns = state.requireReturns;
    if (!state.isRequire || !state.isRequire(path.scope, path.node)) return;
    state.requireStatistics.count++;
    if (state.modified[path.node.callee.name]) return;

    let moduleId = path.node.arguments[0].value;
    let new_node = requireReturns.get(moduleId);
    if (new_node !== undefined) {
      markVisited(new_node, state.serializedBindings);
      path.replaceWith(new_node);
      state.requireStatistics.replaced++;
    }
  },

  "AssignmentExpression|UpdateExpression"(path: BabelTraversePath, state: ClosureRefReplacerState) {
    let serializedBindings = state.serializedBindings;
    let ids = path.getBindingIdentifierPaths();

    for (let innerName in ids) {
      let nestedPath = ids[innerName];
      if (path.scope.hasBinding(innerName, /*noGlobals*/true)) return;

      let serializedBinding = serializedBindings[innerName];
      if (serializedBinding && shouldVisit(nestedPath.node, serializedBindings)) {
        markVisited(serializedBinding.serializedValue, serializedBindings);
        nestedPath.replaceWith(serializedBinding.serializedValue);
      }
    }
  }
};

function visitName(state, name, modified) {
  let doesNotMatter = true;
  let ref = state.tryQuery(
    () => ResolveBinding(state.realm, name, doesNotMatter, state.val.$Environment),
    undefined, true);
  if (ref === undefined) return;
  if (IsUnresolvableReference(state.realm, ref)) return;
  state.map[name] = true;
  if (modified) state.functionInfo.modified[name] = true;
}

function ignorePath(path: BabelTraversePath) {
  let parent = path.parent;
  return t.isLabeledStatement(parent) || t.isBreakStatement(parent) || t.isContinueStatement(parent);
}

// TODO doesn't check that `arguments` and `this` is in top function
export let ClosureRefVisitor = {
  ReferencedIdentifier(path: BabelTraversePath, state: ClosureRefVisitorState) {
    if (ignorePath(path)) return;

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
