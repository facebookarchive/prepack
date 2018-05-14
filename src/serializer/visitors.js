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
import * as t from "babel-types";
import type { BabelNodeCallExpression } from "babel-types";
import type { BabelTraversePath, BabelTraverseScope } from "babel-traverse";
import type { FunctionInfo } from "./types.js";

type GetModuleIdIfNodeIsRequireFunction =
  | void
  | ((scope: BabelTraverseScope, node: BabelNodeCallExpression) => void | number | string);

export type ClosureRefVisitorState = {
  functionInfo: FunctionInfo,
  realm: Realm,
  getModuleIdIfNodeIsRequireFunction: GetModuleIdIfNodeIsRequireFunction,
};

function visitName(path, state, node, modified) {
  // Is the name bound to some local identifier? If so, we don't need to do anything
  if (path.scope.hasBinding(node.name, /*noGlobals*/ true)) return;

  // Otherwise, let's record that there's an unbound identifier
  let nodes = state.functionInfo.unbound.get(node.name);
  if (nodes === undefined) state.functionInfo.unbound.set(node.name, (nodes = []));
  nodes.push(node);
  if (modified) state.functionInfo.modified.add(node.name);
}

function ignorePath(path: BabelTraversePath) {
  let parent = path.parent;
  return t.isLabeledStatement(parent) || t.isBreakStatement(parent) || t.isContinueStatement(parent);
}

export let ClosureRefVisitor = {
  "FunctionDeclaration|FunctionExpression": {
    enter(path: BabelTraversePath, state: ClosureRefVisitorState) {
      state.functionInfo.depth++;
    },
    exit(path: BabelTraversePath, state: ClosureRefVisitorState) {
      state.functionInfo.depth--;
    },
  },

  CallExpression(path: BabelTraversePath, state: ClosureRefVisitorState) {
    // Here we apply the require optimization by replacing require calls with their
    // corresponding initialized modules.
    if (state.getModuleIdIfNodeIsRequireFunction === undefined) return;
    let moduleId = state.getModuleIdIfNodeIsRequireFunction(path.scope, path.node);
    if (moduleId === undefined) return;
    state.functionInfo.requireCalls.set(path.node, moduleId);
  },

  ReferencedIdentifier(path: BabelTraversePath, state: ClosureRefVisitorState) {
    if (ignorePath(path)) return;

    let innerName = path.node.name;
    if (innerName === "arguments") {
      if (state.functionInfo.depth === 1) {
        state.functionInfo.usesArguments = true;
      }
      // "arguments" bound to local scope. therefore, there's no need to visit this identifier.
      return;
    }
    visitName(path, state, path.node, false);
  },

  ThisExpression(path: BabelTraversePath, state: ClosureRefVisitorState) {
    if (state.functionInfo.depth === 1) {
      state.functionInfo.usesThis = true;
    }
  },

  "AssignmentExpression|UpdateExpression"(path: BabelTraversePath, state: ClosureRefVisitorState) {
    let ids = path.getBindingIdentifiers();
    for (let name in ids) {
      visitName(path, state, ids[name], true);
    }
  },
};
