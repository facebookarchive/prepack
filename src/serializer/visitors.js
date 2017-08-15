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
import { FunctionValue } from "../values/index.js";
import * as t from "babel-types";
import type { BabelNodeExpression, BabelNodeCallExpression } from "babel-types";
import { BabelTraversePath } from "babel-traverse";
import type { TryQuery, FunctionInfo, Names } from "./types.js";

export type ClosureRefVisitorState = {
  tryQuery: TryQuery<*>,
  val: FunctionValue,
  functionInfo: FunctionInfo,
  realm: Realm,
};

export type ClosureRefReplacerState = {
  serializedBindings: any,
  modified: Names,
  requireReturns: Map<number | string, BabelNodeExpression>,
  requireStatistics: { replaced: 0, count: 0 },
  isRequire: void | ((scope: any, node: BabelNodeCallExpression) => boolean),
};

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
function replaceName(path, serializedBinding, name, data) {
  if (path.scope.hasBinding(name, /*noGlobals*/ true)) return;

  if (serializedBinding && shouldVisit(path.node, data)) {
    markVisited(serializedBinding.serializedValue, data);
    path.replaceWith(serializedBinding.serializedValue);
  }
}

export let ClosureRefReplacer = {
  ReferencedIdentifier(path: BabelTraversePath, state: ClosureRefReplacerState) {
    if (ignorePath(path)) return;

    let serializedBindings = state.serializedBindings;
    let name = path.node.name;
    let serializedBinding = serializedBindings[name];
    if (serializedBinding) replaceName(path, serializedBinding, name, serializedBindings);
  },

  CallExpression(path: BabelTraversePath, state: ClosureRefReplacerState) {
    // Here we apply the require optimization by replacing require calls with their
    // corresponding initialized modules.
    let requireReturns = state.requireReturns;
    if (!state.isRequire || !state.isRequire(path.scope, path.node)) return;
    state.requireStatistics.count++;
    if (state.modified[path.node.callee.name]) return;

    let moduleId = "" + path.node.arguments[0].value;
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
    for (let name in ids) {
      let serializedBinding = serializedBindings[name];
      if (serializedBinding) {
        let nestedPath = ids[name];
        replaceName(nestedPath, serializedBinding, name, serializedBindings);
      }
    }
  },
};

function visitName(path, state, name, modified) {
  // Is the name bound to some local identifier? If so, we don't need to do anything
  if (path.scope.hasBinding(name, /*noGlobals*/ true)) return;

  // Otherwise, let's record that there's an unbound identifier
  state.functionInfo.unbound[name] = true;
  if (modified) state.functionInfo.modified[name] = true;
}

function ignorePath(path: BabelTraversePath) {
  let parent = path.parent;
  return t.isLabeledStatement(parent) || t.isBreakStatement(parent) || t.isContinueStatement(parent);
}

// TODO #886: doesn't check that `arguments` and `this` is in top function
export let ClosureRefVisitor = {
  ReferencedIdentifier(path: BabelTraversePath, state: ClosureRefVisitorState) {
    if (ignorePath(path)) return;

    let innerName = path.node.name;
    if (innerName === "arguments") {
      state.functionInfo.usesArguments = true;
      return;
    }
    visitName(path, state, innerName, false);
  },

  ThisExpression(path: BabelTraversePath, state: ClosureRefVisitorState) {
    state.functionInfo.usesThis = true;
  },

  "AssignmentExpression|UpdateExpression"(path: BabelTraversePath, state: ClosureRefVisitorState) {
    for (let name in path.getBindingIdentifiers()) {
      visitName(path, state, name, true);
    }
  },
};
