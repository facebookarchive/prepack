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
import { convertExpressionToJSXIdentifier } from "../react/jsx";
import type { BabelNodeExpression, BabelNodeCallExpression, BabelNodeFunctionExpression } from "babel-types";
import type { BabelTraversePath, BabelTraverseScope } from "babel-traverse";
import type { FunctionBodyAstNode } from "../types.js";
import type { TryQuery, FunctionInfo, FactoryFunctionInfo, ResidualFunctionBinding } from "./types.js";
import { nullExpression } from "../utils/internalizer.js";

export type ClosureRefVisitorState = {
  tryQuery: TryQuery<*>,
  val: FunctionValue,
  functionInfo: FunctionInfo,
  realm: Realm,
};

export type ClosureRefReplacerState = {
  residualFunctionBindings: Map<string, ResidualFunctionBinding>,
  modified: Set<string>,
  requireReturns: Map<number | string, BabelNodeExpression>,
  requireStatistics: { replaced: 0, count: 0 },
  getModuleIdIfNodeIsRequireFunction:
    | void
    | ((scope: BabelTraverseScope, node: BabelNodeCallExpression) => void | number | string),
  factoryFunctionInfos: Map<number, FactoryFunctionInfo>,
};

function markVisited(node, data) {
  (node: any)._renamedOnce = data;
}

function shouldVisit(node, data) {
  return (node: any)._renamedOnce !== data;
}

// replaceWith causes the node to be re-analyzed, so to prevent double replacement
// we add this property on the node to mark it such that it does not get replaced
// again on this pass
// TODO: Make this work when replacing with arbitrary BabelNodeExpressions. Currently
//       if the node that we're substituting contains identifiers as children,
//       they will be visited again and possibly transformed.
//       If necessary we could implement this by following node.parentPath and checking
//       if any parent nodes are marked visited, but that seem unnecessary right now.let closureRefReplacer = {
function replaceName(path, residualFunctionBinding, name, data) {
  // Let's skip names that are bound
  if (path.scope.hasBinding(name, /*noGlobals*/ true)) return;

  // Let's skip bindings that are referring to
  // 1) something global (without an environment record), and
  // 2) have not been assigned a value (which would mean that they have a var/let binding and Prepack will take the liberty to rename them).
  if (residualFunctionBinding.declarativeEnvironmentRecord === null && residualFunctionBinding.value === undefined)
    return;

  if (shouldVisit(path.node, data)) {
    markVisited(residualFunctionBinding.serializedValue, data);
    let serializedValue = residualFunctionBinding.serializedValue;

    if (path.node.type === "JSXIdentifier" || path.node.type === "JSXMemberIdentifier") {
      path.replaceWith(convertExpressionToJSXIdentifier((serializedValue: any), true));
    } else {
      path.replaceWith(serializedValue);
    }
  }
}

function getLiteralTruthiness(node): { known: boolean, value?: boolean } {
  // In the return value, 'known' is true only if this is a literal of known truthiness and with no side effects; if 'known' is true, 'value' is its truthiness.
  if (t.isBooleanLiteral(node) || t.isNumericLiteral(node) || t.isStringLiteral(node)) {
    return { known: true, value: !!node.value };
  }
  if (
    t.isFunctionExpression(node) ||
    t.isArrowFunctionExpression(node) ||
    t.isRegExpLiteral(node) ||
    (t.isClassExpression(node) && node.superClass === null && node.body.body.length === 0) ||
    (t.isObjectExpression(node) && node.properties.length === 0) ||
    (t.isArrayExpression(node) && node.elements.length === 0)
  ) {
    return { known: true, value: true };
  }
  if (t.isNullLiteral(node)) {
    return { known: true, value: false };
  }
  return { known: false };
}

function canShareFunctionBody(duplicateFunctionInfo: FactoryFunctionInfo): boolean {
  if (duplicateFunctionInfo.anyContainingAdditionalFunction) {
    // If the function is referenced by an optimized function,
    // it may get emitted within that optimized function,
    // and then the function name is not generally available in arbitrary other code
    // where we'd like to replace the body with a reference to the extracted function body.
    // TODO: Revisit interplay of factory function concept, scope concept, and optimized functions.
    return false;
  }

  // Only share function when:
  // 1. it does not access any free variables.
  // 2. it does not use "this".
  const { unbound, modified, usesThis } = duplicateFunctionInfo.functionInfo;
  return unbound.size === 0 && modified.size === 0 && !usesThis;
}

export let ClosureRefReplacer = {
  ReferencedIdentifier(path: BabelTraversePath, state: ClosureRefReplacerState) {
    if (ignorePath(path)) return;

    let residualFunctionBindings = state.residualFunctionBindings;
    let name = path.node.name;
    let residualFunctionBinding = residualFunctionBindings.get(name);
    if (residualFunctionBinding) replaceName(path, residualFunctionBinding, name, residualFunctionBindings);
  },

  CallExpression(path: BabelTraversePath, state: ClosureRefReplacerState) {
    // Here we apply the require optimization by replacing require calls with their
    // corresponding initialized modules.
    let requireReturns = state.requireReturns;
    if (state.getModuleIdIfNodeIsRequireFunction === undefined) return;
    let moduleId = state.getModuleIdIfNodeIsRequireFunction(path.scope, path.node);
    if (moduleId === undefined) return;

    state.requireStatistics.count++;
    if (state.modified.has(path.node.callee.name)) return;

    let new_node = requireReturns.get("" + moduleId);
    if (new_node !== undefined) {
      markVisited(new_node, state.residualFunctionBindings);
      path.replaceWith(new_node);
      state.requireStatistics.replaced++;
    }
  },

  "AssignmentExpression|UpdateExpression"(path: BabelTraversePath, state: ClosureRefReplacerState) {
    let residualFunctionBindings = state.residualFunctionBindings;
    let ids = path.getBindingIdentifierPaths();
    for (let name in ids) {
      let residualFunctionBinding = residualFunctionBindings.get(name);
      if (residualFunctionBinding) {
        let nestedPath = ids[name];
        replaceName(nestedPath, residualFunctionBinding, name, residualFunctionBindings);
      }
    }
  },

  // TODO: handle FunctionDeclaration.
  // Replace "function () {}" ==> "factory_id.bind(null)".
  "FunctionExpression|ArrowFunctionExpression"(path: BabelTraversePath, state: ClosureRefReplacerState) {
    if (t.isProgram(path.parentPath.parentPath.node)) {
      // Our goal is replacing duplicate nested function so skip root residual function itself.
      // This assumes the root function is wrapped with: t.file(t.program([t.expressionStatement(rootFunction).
      return;
    }

    const functionExpression: BabelNodeFunctionExpression = path.node;
    const functionTag = ((functionExpression.body: any): FunctionBodyAstNode).uniqueOrderedTag;
    if (!functionTag) {
      // Un-interpreted nested function.
      return;
    }
    const duplicateFunctionInfo = state.factoryFunctionInfos.get(functionTag);
    if (duplicateFunctionInfo && canShareFunctionBody(duplicateFunctionInfo)) {
      const { factoryId } = duplicateFunctionInfo;
      path.replaceWith(t.callExpression(t.memberExpression(factoryId, t.identifier("bind")), [nullExpression]));
    }
  },

  // A few very simple dead code elimination helpers. Eventually these should be subsumed by the partial evaluators.
  IfStatement: {
    exit: function(path: BabelTraversePath, state: ClosureRefReplacerState) {
      let node = path.node;
      let testTruthiness = getLiteralTruthiness(node.test);
      if (testTruthiness.known) {
        if (testTruthiness.value) {
          // Strictly speaking this is not safe: Annex B.3.4 allows FunctionDeclarations as the body of IfStatements in sloppy mode,
          // which have weird hoisting behavior: `console.log(typeof f); if (true) function f(){} console.log(typeof f)` will print 'undefined', 'function', but
          // `console.log(typeof f); function f(){} console.log(typeof f)` will print 'function', 'function'.
          // However, Babylon can't parse these, so it doesn't come up.
          path.replaceWith(node.consequent);
        } else {
          if (node.alternate !== null) {
            path.replaceWith(node.alternate);
          } else {
            path.remove();
          }
        }
      }
    },
  },

  ConditionalExpression: {
    exit: function(path: BabelTraversePath, state: ClosureRefReplacerState) {
      let node = path.node;
      let testTruthiness = getLiteralTruthiness(node.test);
      if (testTruthiness.known) {
        path.replaceWith(testTruthiness.value ? node.consequent : node.alternate);
      }
    },
  },

  LogicalExpression: {
    exit: function(path: BabelTraversePath, state: ClosureRefReplacerState) {
      let node = path.node;
      let leftTruthiness = getLiteralTruthiness(node.left);
      if (node.operator === "&&" && leftTruthiness.known) {
        path.replaceWith(leftTruthiness.value ? node.right : node.left);
      } else if (node.operator === "||" && leftTruthiness.known) {
        path.replaceWith(leftTruthiness.value ? node.left : node.right);
      }
    },
  },

  WhileStatement: {
    exit: function(path: BabelTraversePath, state: ClosureRefReplacerState) {
      let node = path.node;
      let testTruthiness = getLiteralTruthiness(node.test);
      if (testTruthiness.known && !testTruthiness.value) {
        path.remove();
      }
    },
  },
};

function visitName(path, state, name, modified) {
  // Is the name bound to some local identifier? If so, we don't need to do anything
  if (path.scope.hasBinding(name, /*noGlobals*/ true)) return;

  // Otherwise, let's record that there's an unbound identifier
  state.functionInfo.unbound.add(name);
  if (modified) state.functionInfo.modified.add(name);
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

  ArrowFunctionExpression: {
    enter(path: BabelTraversePath, state: ClosureRefVisitorState) {
      state.functionInfo.depth++;
      state.functionInfo.lexicalDepth++;
    },
    exit(path: BabelTraversePath, state: ClosureRefVisitorState) {
      state.functionInfo.depth--;
      state.functionInfo.lexicalDepth--;
    },
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
    visitName(path, state, innerName, false);
  },

  ThisExpression(path: BabelTraversePath, state: ClosureRefVisitorState) {
    if (state.functionInfo.depth - state.functionInfo.lexicalDepth === 1) {
      state.functionInfo.usesThis = true;
    }
  },

  "AssignmentExpression|UpdateExpression"(path: BabelTraversePath, state: ClosureRefVisitorState) {
    for (let name in path.getBindingIdentifiers()) {
      visitName(path, state, name, true);
    }
  },
};
