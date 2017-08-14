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
import type { BabelNodeStatement, BabelNodeObjectExpression, BabelNodeLVal } from "babel-types";
import { NameGenerator } from "../utils/generator.js";

function isSameNode(left, right) {
  let type = left.type;

  if (type !== right.type) {
    return false;
  }

  if (type === "Identifier") {
    return left.name === right.name;
  }

  if (type === "NullLiteral") {
    return true;
  }

  if (type === "BooleanLiteral" || type === "StringLiteral" || type === "NumericLiteral") {
    return left.value === right.value;
  }

  return false;
}

function getObjectKeys(obj: BabelNodeObjectExpression): string | false {
  let keys = [];

  for (let prop of obj.properties) {
    if (prop.type !== "ObjectProperty") return false;

    let key = prop.key;
    if (key.type === "StringLiteral") {
      keys.push(key.value);
    } else if (key.type === "Identifier") {
      if (prop.computed) return false;
      keys.push(key.name);
    } else {
      return false;
    }
  }

  for (let key of keys) {
    if (key.indexOf("|") >= 0) return false;
  }

  return keys.join("|");
}

// This function looks for recurring initialization patterns in the code of the form
//   var x = { a: literal1, b: literal2 }
//   var y = { a: literal1, b: literal3 }
// and transforms them into something like
//   function factory(b) { return { a: literal1, b } }
//   var x = factory(literal2);
//   var y = factory(literal3);
// TODO #884: Right now, the visitor below only looks into top-level variable declaration
// with a flat object literal initializer.
// It should also look into conditional control flow, residual functions, and nested object literals.
export function factorifyObjects(body: Array<BabelNodeStatement>, factoryNameGenerator: NameGenerator) {
  let signatures = Object.create(null);

  for (let node of body) {
    if (node.type !== "VariableDeclaration") continue;

    for (let declar of node.declarations) {
      let { init } = declar;
      if (!init) continue;
      if (init.type !== "ObjectExpression") continue;

      let keys = getObjectKeys(init);
      if (!keys) continue;

      let declars = (signatures[keys] = signatures[keys] || []);
      declars.push(declar);
    }
  }

  for (let signatureKey in signatures) {
    let declars = signatures[signatureKey];
    if (declars.length < 5) continue;

    let keys = signatureKey.split("|");

    //
    let rootFactoryParams: Array<BabelNodeLVal> = [];
    let rootFactoryProps = [];
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
      let key = keys[keyIndex];
      let id = t.identifier(`__${keyIndex}`);
      rootFactoryParams.push(id);
      let keyNode = t.isValidIdentifier(key) ? t.identifier(key) : t.stringLiteral(key);
      rootFactoryProps.push(t.objectProperty(keyNode, id));
    }

    let rootFactoryId = t.identifier(factoryNameGenerator.generate("root"));
    let rootFactoryBody = t.blockStatement([t.returnStatement(t.objectExpression(rootFactoryProps))]);
    let rootFactory = t.functionDeclaration(rootFactoryId, rootFactoryParams, rootFactoryBody);
    body.unshift(rootFactory);

    //
    for (let declar of declars) {
      let args = [];
      for (let prop of declar.init.properties) {
        args.push(prop.value);
      }

      declar.init = t.callExpression(rootFactoryId, args);
    }

    //
    let seen = new Set();
    for (let declar of declars) {
      if (seen.has(declar)) continue;

      // build up a map containing the arguments that are shared
      let common = new Map();
      let mostSharedArgsLength = 0;
      for (let declar2 of declars) {
        if (seen.has(declar2)) continue;
        if (declar === declar2) continue;

        let sharedArgs = [];
        for (let i = 0; i < keys.length; i++) {
          if (isSameNode(declar.init.arguments[i], declar2.init.arguments[i])) {
            sharedArgs.push(i);
          }
        }
        if (!sharedArgs.length) continue;

        mostSharedArgsLength = Math.max(mostSharedArgsLength, sharedArgs.length);
        common.set(declar2, sharedArgs);
      }

      // build up a mapping of the argument positions that are shared so we can pick the top one
      let sharedPairs = Object.create(null);
      for (let [declar2, args] of common.entries()) {
        if (args.length === mostSharedArgsLength) {
          args = args.join(",");
          let pair = (sharedPairs[args] = sharedPairs[args] || []);
          pair.push(declar2);
        }
      }

      // get the highest pair
      let highestPairArgs;
      let highestPairCount;
      for (let pairArgs in sharedPairs) {
        let pair = sharedPairs[pairArgs];
        if (!highestPairArgs || pair.length > highestPairCount) {
          highestPairCount = pair.length;
          highestPairArgs = pairArgs;
        }
      }
      if (!highestPairArgs) continue;

      //
      let declarsSub = sharedPairs[highestPairArgs].concat(declar);
      let removeArgs = highestPairArgs.split(",");

      let subFactoryArgs = [];
      let subFactoryParams = [];
      let sharedArgs = declarsSub[0].init.arguments;
      for (let i = 0; i < sharedArgs.length; i++) {
        let arg = sharedArgs[i];
        if (removeArgs.indexOf(i + "") >= 0) {
          subFactoryArgs.push(arg);
        } else {
          let id = t.identifier(`__${i}`);
          subFactoryArgs.push(id);
          subFactoryParams.push(id);
        }
      }

      let subFactoryId = t.identifier(factoryNameGenerator.generate("sub"));
      let subFactoryBody = t.blockStatement([t.returnStatement(t.callExpression(rootFactoryId, subFactoryArgs))]);
      let subFactory = t.functionDeclaration(subFactoryId, subFactoryParams, subFactoryBody);
      body.unshift(subFactory);

      for (let declarSub of declarsSub) {
        seen.add(declarSub);

        let call = declarSub.init;
        call.callee = subFactoryId;
        call.arguments = call.arguments.filter(function(val, i) {
          return removeArgs.indexOf(i + "") < 0;
        });
      }
    }
  }
}
