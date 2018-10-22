/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import * as t from "@babel/types";
import { convertExpressionToJSXIdentifier } from "../react/jsx";
import type Value from "../values/Value.js";
import type {
  BabelNodeBinaryExpression,
  BabelNodeCallExpression,
  BabelNodeFunctionExpression,
  BabelNodeExpression,
  BabelNodeClassMethod,
  BabelNodeArrowFunctionExpression,
  BabelNodeWhileStatement,
  BabelNodeJSXIdentifier,
  BabelNodeJSXMemberExpression,
  BabelNodeConditionalExpression,
  BabelNodeIfStatement,
  BabelNodeLogicalExpression,
  BabelNodeBooleanLiteral,
  BabelNodeNumericLiteral,
  BabelNodeStringLiteral,
  BabelNodeUnaryExpression,
  BabelNodeClassExpression,
  BabelNodeObjectExpression,
  BabelNodeArrayExpression,
  BabelNodeSpreadElement,
  BabelNodeLabeledStatement,
} from "@babel/types";
import type { FunctionBodyAstNode } from "../types.js";
import type { FactoryFunctionInfo } from "./types.js";
import { nullExpression } from "../utils/babelhelpers";

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

export type Truthiness = void | boolean; // undefined means unknown

export type Replacement = {
  node: BabelNodeExpression,
  truthiness: Truthiness,
};

export function getReplacement(node: BabelNodeExpression, value: void | Value): Replacement {
  let truthiness;
  if (value !== undefined)
    if (!value.mightNotBeFalse()) truthiness = false;
    else if (!value.mightNotBeTrue()) truthiness = true;
  return { node, truthiness };
}

export function isPure(node: BabelNodeExpression | BabelNodeSpreadElement): boolean {
  switch (node.type) {
    case "NullLiteral":
    case "BooleanLiteral":
    case "StringLiteral":
    case "NumericLiteral":
      return true;
    case "UnaryExpression":
    case "SpreadElement":
      let unaryExpression = ((node: any): BabelNodeUnaryExpression | BabelNodeSpreadElement);
      return isPure(unaryExpression.argument);
    case "BinaryExpression":
    case "LogicalExpression":
      let binaryExpression = ((node: any): BabelNodeLogicalExpression | BabelNodeBinaryExpression);
      return isPure(binaryExpression.left) && isPure(binaryExpression.right);
    default:
      return false;
  }
}

// This class instantiates residual functions by replacing certain nodes,
// i.e. bindings to captured scopes that need to get renamed to variable ids.
// The original nodes are never mutated; instead, nodes are cloned as needed.
// Along the way, some trivial code optimizations are performed as well.
export class ResidualFunctionInstantiator<
  T: BabelNodeClassMethod | BabelNodeFunctionExpression | BabelNodeArrowFunctionExpression
> {
  factoryFunctionInfos: Map<number, FactoryFunctionInfo>;
  factoryFunctionsToRemove: Map<number, string>;
  identifierReplacements: Map<BabelNodeIdentifier, Replacement>;
  callReplacements: Map<BabelNodeCallExpression, Replacement>;
  root: T;

  constructor(
    factoryFunctionInfos: Map<number, FactoryFunctionInfo>,
    factoryFunctionsToRemove: Map<number, string>,
    identifierReplacements: Map<BabelNodeIdentifier, Replacement>,
    callReplacements: Map<BabelNodeCallExpression, Replacement>,
    root: T
  ) {
    this.factoryFunctionInfos = factoryFunctionInfos;
    this.factoryFunctionsToRemove = factoryFunctionsToRemove;
    this.identifierReplacements = identifierReplacements;
    this.callReplacements = callReplacements;
    this.root = root;
  }

  instantiate(): T {
    return ((this._replace(this.root): any): T);
  }

  _getLiteralTruthiness(node: BabelNodeExpression): Truthiness {
    switch (node.type) {
      case "BooleanLiteral":
      case "NumericLiteral":
      case "StringLiteral":
        return !!((node: any): BabelNodeBooleanLiteral | BabelNodeNumericLiteral | BabelNodeStringLiteral).value;
      case "Identifier": {
        let replacement = this.identifierReplacements.get(node);
        if (replacement !== undefined) return replacement.truthiness;
        return undefined;
      }
      case "CallExpression": {
        let replacement = this.callReplacements.get(node);
        if (replacement !== undefined) return replacement.truthiness;
        return undefined;
      }
      case "FunctionExpression":
      case "ArrowFunctionExpression":
      case "RegExpLiteral":
        return true;
      case "ClassExpression":
        let classExpression = ((node: any): BabelNodeClassExpression);
        return classExpression.superClass === null && classExpression.body.body.length === 0 ? true : undefined;
      case "ObjectExpression":
        let objectExpression = ((node: any): BabelNodeObjectExpression);
        return objectExpression.properties.every(property => isPure(property.key) && isPure(property.value))
          ? true
          : undefined;
      case "ArrayExpression":
        let arrayExpression = ((node: any): BabelNodeArrayExpression);
        return arrayExpression.elements.every(element => element === undefined || isPure(element)) ? true : undefined;
      case "NullLiteral":
        return false;
      case "UnaryExpression":
        let unaryExpression = ((node: any): BabelNodeUnaryExpression);
        return unaryExpression.operator === "void" && isPure(unaryExpression.argument) ? false : undefined;
      default:
        return undefined;
    }
  }

  _replaceIdentifier(node: BabelNodeIdentifier): BabelNode {
    let replacement = this.identifierReplacements.get(node);
    if (replacement !== undefined) return replacement.node;
    return node; // nothing else to replace in an identifier
  }

  _replaceJSXIdentifier(node: BabelNodeJSXIdentifier | BabelNodeJSXMemberExpression): BabelNode {
    let replacement = this.identifierReplacements.get(node);
    if (replacement !== undefined) return convertExpressionToJSXIdentifier(replacement.node, true);
    return node; // nothing else to replace in an identifier
  }

  _replaceLabeledStatement(node: BabelNodeLabeledStatement): BabelNode {
    // intentionally ignore embedded identifier
    let newBody = this._replace(node.body);
    if (newBody !== node.body) {
      let res = Object.assign({}, node);
      res.body = newBody;
      return res;
    }
    return node; // nothing else to replace in a labeled statement
  }

  _replaceCallExpression(node: BabelNodeCallExpression): BabelNode {
    let replacement = this.callReplacements.get(node);
    if (replacement !== undefined) return replacement.node;
    return this._replaceFallback(node);
  }

  _replaceFunctionExpression(node: BabelNodeFunctionExpression): BabelNode {
    // Our goal is replacing duplicate nested function so skip root residual function itself.
    if (this.root !== node) {
      const functionExpression: BabelNodeFunctionExpression = node;
      const functionTag = ((functionExpression.body: any): FunctionBodyAstNode).uniqueOrderedTag;
      // Un-interpreted nested function?
      if (functionTag !== undefined) {
        // Un-interpreted nested function.

        const duplicateFunctionInfo = this.factoryFunctionInfos.get(functionTag);
        if (duplicateFunctionInfo && canShareFunctionBody(duplicateFunctionInfo)) {
          const { factoryId } = duplicateFunctionInfo;
          return t.callExpression(t.memberExpression(factoryId, t.identifier("bind")), [nullExpression]);
        }

        if (this.factoryFunctionsToRemove.has(functionTag)) {
          let newFunctionExpression = Object.assign({}, node);
          newFunctionExpression.body = t.blockStatement([
            t.throwStatement(
              t.newExpression(t.identifier("Error"), [t.stringLiteral("Function was specialized out by Prepack")])
            ),
          ]);
          return newFunctionExpression;
        }
      }
    }

    return this._replaceFallback(node);
  }

  _replaceIfStatement(node: BabelNodeIfStatement): BabelNode {
    let testTruthiness = this._getLiteralTruthiness(node.test);
    if (testTruthiness === true) {
      // Strictly speaking this is not safe: Annex B.3.4 allows FunctionDeclarations as the body of IfStatements in sloppy mode,
      // which have weird hoisting behavior: `console.log(typeof f); if (true) function f(){} console.log(typeof f)` will print 'undefined', 'function', but
      // `console.log(typeof f); function f(){} console.log(typeof f)` will print 'function', 'function'.
      // However, Babylon can't parse these, so it doesn't come up.
      return this._replace(node.consequent);
    } else if (testTruthiness === false) {
      if (node.alternate !== null) {
        return this._replace(node.alternate);
      } else {
        return t.emptyStatement();
      }
    }

    return this._replaceFallback(node);
  }

  _replaceConditionalExpression(node: BabelNodeConditionalExpression): BabelNode {
    let testTruthiness = this._getLiteralTruthiness(node.test);
    if (testTruthiness !== undefined) {
      return testTruthiness ? this._replace(node.consequent) : this._replace(node.alternate);
    }

    return this._replaceFallback(node);
  }

  _replaceLogicalExpression(node: BabelNodeLogicalExpression): BabelNode {
    let leftTruthiness = this._getLiteralTruthiness(node.left);
    if (node.operator === "&&" && leftTruthiness !== undefined) {
      return leftTruthiness ? this._replace(node.right) : this._replace(node.left);
    } else if (node.operator === "||" && leftTruthiness !== undefined) {
      return leftTruthiness ? this._replace(node.left) : this._replace(node.right);
    }

    return this._replaceFallback(node);
  }

  _replaceWhileStatement(node: BabelNodeWhileStatement): BabelNode {
    let testTruthiness = this._getLiteralTruthiness(node.test);
    if (testTruthiness === false) {
      return t.emptyStatement();
    }

    return this._replaceFallback(node);
  }

  _replaceFallback(node: BabelNode): BabelNode {
    let newNode;
    for (let key in node) {
      let subNode = (node: any)[key];
      if (!subNode) continue;
      let newSubNode;
      if (Array.isArray(subNode)) {
        let newArray;
        for (let i = 0; i < subNode.length; i++) {
          let elementNode = subNode[i];
          if (!elementNode) continue;
          let newElementNode = this._replace(elementNode);
          if (newElementNode !== elementNode) {
            if (newArray === undefined) newArray = subNode.slice(0);
            newArray[i] = newElementNode;
          }
        }
        if (newArray === undefined) continue;
        newSubNode = newArray;
      } else if (subNode.type) {
        newSubNode = this._replace(subNode);
        if (newSubNode === subNode) continue;
      } else continue;

      if (newNode === undefined) newNode = Object.assign({}, node);
      newNode[key] = newSubNode;
    }
    return newNode || node;
  }

  _replace(node: BabelNode): BabelNode {
    switch (node.type) {
      case "Identifier":
        return this._replaceIdentifier(node);
      case "LabeledStatement":
        return this._replaceLabeledStatement(node);
      case "BreakStatement":
      case "ContinueStatement":
        return node;
      case "JSXIdentifier":
      case "JSXMemberExpressions":
        return this._replaceJSXIdentifier(node);
      case "CallExpression":
        return this._replaceCallExpression(node);
      case "FunctionExpression":
        return this._replaceFunctionExpression(node);
      case "IfStatement":
        return this._replaceIfStatement(node);
      case "ConditionalExpression":
        return this._replaceConditionalExpression(node);
      case "LogicalExpression":
        return this._replaceLogicalExpression(node);
      case "WhileStatement":
        return this._replaceWhileStatement(node);
      default:
        return this._replaceFallback(node);
    }
  }
}
